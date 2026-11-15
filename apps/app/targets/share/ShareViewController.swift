// The "Fwd:Me" sheet in the iOS share sheet. It saves the shared link right
// away (no questions), then offers an optional comment and who can see it,
// and closes on its own after a few seconds unless the user starts using them.
// Same behaviour as the Android share screen (apps/app/src/app/share.tsx).
//
// It can't use the app's session: the signed-in app leaves a share token, the
// server URL and key, and the language in the App Group (see
// apps/app/src/lib/share-token.ios.ts). Saving goes through the `share` Edge
// Function, which finds the link with the same code as the app.

import UIKit
import UniformTypeIdentifiers

private let appGroup = "group.app.fwdme.mobile"
private let autoCloseSeconds: TimeInterval = 4

private struct Payload {
  let value: String
  let shareType: String  // "url" or "text"
}

/// Shared items arrive on background queues; collected under a lock.
private final class PayloadCollector {
  private let lock = NSLock()
  private var items: [Payload] = []

  func add(_ payload: Payload) {
    lock.lock()
    items.append(payload)
    lock.unlock()
  }

  /// URLs first: the server takes the first payload that holds a link.
  func sorted() -> [Payload] {
    lock.lock()
    defer { lock.unlock() }
    return items.filter { $0.shareType == "url" } + items.filter { $0.shareType == "text" }
  }
}

private enum SaveError: Error {
  case notSignedIn
  case invalidToken
  case noLink
  case network
}

final class ShareViewController: UIViewController, UITextFieldDelegate {
  private let defaults = UserDefaults(suiteName: appGroup)
  private lazy var hebrew = (defaults?.string(forKey: "locale") ?? "he") == "he"

  private let card = UIView()
  private let stack = UIStackView()
  private let statusLabel = UILabel()
  private let detailLabel = UILabel()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let commentField = UITextField()
  private let visibilityControl = UISegmentedControl()
  private let primaryButton = UIButton(type: .system)

  private var payloads: [Payload] = []
  private var scrapId: String?
  private var lastError: SaveError?
  private var touched = false
  private var closeTimer: Timer?

  private static let green = UIColor(red: 4 / 255, green: 120 / 255, blue: 87 / 255, alpha: 1)

  // MARK: - Text (Hebrew is the default, like the app)

  private func t(_ key: String) -> String {
    let he: [String: String] = [
      "saving": "שומר ב-Fwd:Me…",
      "saved": "נשמר ✓",
      "alreadySaved": "כבר בספרייה שלך ✓",
      "comment": "הוספת הערה (לא חובה)",
      "private": "רק אני",
      "followers": "עוקבים",
      "public": "ציבורי",
      "done": "סיום",
      "close": "סגירה",
      "retry": "לנסות שוב",
      "notSignedIn": "פתחו את Fwd:Me והתחברו, ואז שתפו שוב.",
      "invalidToken": "פתחו את Fwd:Me פעם אחת כדי להתחבר מחדש, ואז שתפו שוב.",
      "noLink": "לא נמצא קישור במה ששיתפת.",
      "network": "לא הצלחנו לשמור. בדקו את החיבור ונסו שוב.",
    ]
    let en: [String: String] = [
      "saving": "Saving to Fwd:Me…",
      "saved": "Saved ✓",
      "alreadySaved": "Already in your library ✓",
      "comment": "Add a comment (optional)",
      "private": "Only me",
      "followers": "Followers",
      "public": "Public",
      "done": "Done",
      "close": "Close",
      "retry": "Try again",
      "notSignedIn": "Open Fwd:Me and sign in, then share again.",
      "invalidToken": "Open Fwd:Me once to reconnect, then share again.",
      "noLink": "There's no link in what you shared.",
      "network": "Couldn't save. Check your connection and try again.",
    ]
    return (hebrew ? he[key] : en[key]) ?? key
  }

  // MARK: - Layout

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor.black.withAlphaComponent(0.35)
    // Tapping outside the card closes the sheet (after sending a typed comment).
    let backgroundTap = UITapGestureRecognizer(target: self, action: #selector(backgroundTapped(_:)))
    backgroundTap.cancelsTouchesInView = false
    view.addGestureRecognizer(backgroundTap)
    buildCard()
    showSaving()
    collectPayloads { [weak self] found in
      guard let self else { return }
      self.payloads = found
      self.save()
    }
  }

  private func buildCard() {
    card.backgroundColor = .systemBackground
    card.layer.cornerRadius = 16
    card.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(card)

    stack.axis = .vertical
    stack.spacing = 12
    stack.alignment = .fill
    stack.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(stack)

    let header = UIStackView(arrangedSubviews: [spinner, statusLabel])
    header.axis = .horizontal
    header.spacing = 8
    header.alignment = .center
    statusLabel.font = .preferredFont(forTextStyle: .headline)
    statusLabel.numberOfLines = 0
    statusLabel.textAlignment = .natural
    spinner.hidesWhenStopped = true

    detailLabel.font = .preferredFont(forTextStyle: .subheadline)
    detailLabel.textColor = .secondaryLabel
    detailLabel.numberOfLines = 0
    detailLabel.textAlignment = .natural

    commentField.placeholder = t("comment")
    commentField.borderStyle = .roundedRect
    commentField.textAlignment = .natural
    commentField.returnKeyType = .done
    commentField.delegate = self
    commentField.addTarget(self, action: #selector(userTouched), for: .editingDidBegin)

    for (index, key) in ["private", "followers", "public"].enumerated() {
      visibilityControl.insertSegment(withTitle: t(key), at: index, animated: false)
    }
    visibilityControl.addTarget(self, action: #selector(visibilityChanged), for: .valueChanged)

    primaryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    primaryButton.backgroundColor = ShareViewController.green
    primaryButton.setTitleColor(.white, for: .normal)
    primaryButton.layer.cornerRadius = 10
    primaryButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    primaryButton.addTarget(self, action: #selector(primaryTapped), for: .touchUpInside)

    for subview in [header, detailLabel, commentField, visibilityControl, primaryButton] {
      stack.addArrangedSubview(subview)
    }

    // Right to left in Hebrew, whatever the phone's language (each view needs it).
    if hebrew {
      for subview in [view!, card, stack, header, statusLabel, detailLabel, commentField, visibilityControl, primaryButton] {
        subview.semanticContentAttribute = .forceRightToLeft
      }
    }

    NSLayoutConstraint.activate([
      card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      card.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
      stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 20),
      stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -20),
    ])
  }

  private func showSaving() {
    lastError = nil
    spinner.startAnimating()
    statusLabel.text = t("saving")
    detailLabel.isHidden = true
    commentField.isHidden = true
    visibilityControl.isHidden = true
    primaryButton.isHidden = true
  }

  private func showSaved(alreadySaved: Bool, host: String) {
    spinner.stopAnimating()
    statusLabel.text = t(alreadySaved ? "alreadySaved" : "saved")
    detailLabel.text = host
    detailLabel.isHidden = host.isEmpty
    commentField.isHidden = false
    visibilityControl.isHidden = false
    primaryButton.isHidden = false
    primaryButton.setTitle(t("done"), for: .normal)
    scheduleAutoClose()
  }

  private func showError(_ error: SaveError) {
    lastError = error
    spinner.stopAnimating()
    let key: String
    switch error {
    case .notSignedIn: key = "notSignedIn"
    case .invalidToken: key = "invalidToken"
    case .noLink: key = "noLink"
    case .network: key = "network"
    }
    statusLabel.text = t(key)
    detailLabel.isHidden = true
    commentField.isHidden = true
    visibilityControl.isHidden = true
    primaryButton.isHidden = false
    primaryButton.setTitle(t(error == .network ? "retry" : "close"), for: .normal)
  }

  // MARK: - Reading what was shared

  /// Links and text from every item the source app handed over.
  private func collectPayloads(_ completion: @escaping ([Payload]) -> Void) {
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    let collector = PayloadCollector()
    let group = DispatchGroup()

    for item in items {
      if let caption = item.attributedContentText?.string,
         !caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        collector.add(Payload(value: caption, shareType: "text"))
      }
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
            if let url = data as? URL, !url.isFileURL {
              collector.add(Payload(value: url.absoluteString, shareType: "url"))
            } else if let string = data as? String {
              collector.add(Payload(value: string, shareType: "url"))
            }
            group.leave()
          }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
            if let string = data as? String {
              collector.add(Payload(value: string, shareType: "text"))
            }
            group.leave()
          }
        }
      }
    }

    group.notify(queue: .main) {
      completion(collector.sorted())
    }
  }

  // MARK: - Talking to the server

  private func save() {
    showSaving()
    let body: [String: Any] = [
      "action": "save",
      "payloads": payloads.map { ["value": $0.value, "shareType": $0.shareType] },
    ]
    post(body) { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let json):
        self.scrapId = json["scrapId"] as? String
        self.showSaved(alreadySaved: json["alreadySaved"] as? Bool ?? false, host: json["host"] as? String ?? "")
      case .failure(let error):
        if error == .invalidToken { self.defaults?.set("1", forKey: "shareTokenInvalid") }
        self.showError(error)
      }
    }
  }

  /// POSTs to the `share` Edge Function; calls back on the main queue.
  private func post(_ body: [String: Any], completion: @escaping (Result<[String: Any], SaveError>) -> Void) {
    guard let token = defaults?.string(forKey: "shareToken"),
          let apiUrl = defaults?.string(forKey: "apiUrl"),
          let apiKey = defaults?.string(forKey: "apiKey"),
          let url = URL(string: apiUrl + "/functions/v1/share") else {
      completion(.failure(.notSignedIn))
      return
    }
    var payload = body
    payload["token"] = token
    var request = URLRequest(url: url, timeoutInterval: 20)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(apiKey, forHTTPHeaderField: "apikey")
    request.httpBody = try? JSONSerialization.data(withJSONObject: payload)

    URLSession.shared.dataTask(with: request) { data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any] ?? [:]
      let result: Result<[String: Any], SaveError>
      switch status {
      case 200: result = .success(json)
      case 401: result = .failure(.invalidToken)
      case 422: result = .failure(.noLink)
      default: result = .failure(.network)
      }
      DispatchQueue.main.async { completion(result) }
    }.resume()
  }

  // MARK: - Actions

  @objc private func userTouched() {
    touched = true
    closeTimer?.invalidate()
  }

  @objc private func visibilityChanged() {
    userTouched()
    guard let scrapId else { return }
    let values = ["private", "followers", "public"]
    let index = visibilityControl.selectedSegmentIndex
    guard index >= 0, index < values.count else { return }
    post(["action": "visibility", "scrapId": scrapId, "visibility": values[index]]) { _ in }
  }

  @objc private func primaryTapped() {
    if lastError == .network {
      save()
      return
    }
    finish()
  }

  @objc private func backgroundTapped(_ gesture: UITapGestureRecognizer) {
    guard !card.frame.contains(gesture.location(in: view)) else { return }
    if commentField.isFirstResponder {
      commentField.resignFirstResponder()
      return
    }
    finish()
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    finish()
    return true
  }

  private func scheduleAutoClose() {
    closeTimer?.invalidate()
    closeTimer = Timer.scheduledTimer(withTimeInterval: autoCloseSeconds, repeats: false) { [weak self] _ in
      guard let self, !self.touched else { return }
      self.finish()
    }
  }

  /// Sends the comment if there is one, then closes the sheet.
  private func finish() {
    closeTimer?.invalidate()
    let comment = commentField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if let scrapId, !comment.isEmpty {
      primaryButton.isEnabled = false
      post(["action": "comment", "scrapId": scrapId, "body": comment]) { [weak self] _ in
        self?.close()
      }
    } else {
      close()
    }
  }

  private func close() {
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }
}
