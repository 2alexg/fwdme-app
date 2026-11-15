// iOS share extension: the "Fwd:Me" entry in the share sheet. Native Swift (no
// React Native inside the extension: it opens instantly and stays far below
// iOS's memory limit for extensions). It saves through the `share` Edge
// Function with the device's share token, which the app puts in the App Group.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'share',
  name: 'ShareExtension',
  displayName: 'Fwd:Me',
  bundleIdentifier: '.share',
  deploymentTarget: '16.0',
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
