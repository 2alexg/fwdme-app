import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8081';
const out = process.env.SCREENSHOT_DIR ?? new URL('./screenshots', import.meta.url).pathname;
await import('node:fs').then((fs) => fs.mkdirSync(out, { recursive: true }));
const run = Date.now().toString(36);
const email = `e2e_${run}@test.local`;
const username = `e2e_${run}`;
const password = 'correct-horse-battery';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const step = (s) => console.log('✓', s);
// Tabs stay mounted on web: only count cards on the screen in front.
const shownCards = () =>
  page.evaluate(() => [...document.querySelectorAll('a[href^="/scrap/"]')].filter((a) => a.offsetParent && !a.closest('[aria-hidden="true"],[inert]')).length);
// The view switcher on the screen in front (hidden tabs are inert).
const viewRadio = (name) => page.locator(`[role=radio][aria-label="${name}"]:not([inert] *)`);
const tab = (name) => page.getByRole('tab', { name }).click();
/** Save a link through the library's + button and sheet. */
async function addLink(link, { comment, visibility } = {}) {
  await page.getByRole('button', { name: 'Save a link' }).click();
  await page.getByPlaceholder('Paste a link…').fill(link);
  if (comment) await page.getByPlaceholder('Why are you saving it? (optional)').fill(comment);
  if (visibility) await page.getByRole('dialog').getByRole('radio', { name: visibility }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
}

// Unauthenticated visit to the library redirects to sign-in
await page.goto(`${BASE}/`);
await page.getByRole('button', { name: 'Sign in' }).waitFor();
step('signed-out visitor lands on sign-in');

// Sign up
await page.getByText('New here? Create an account').click();
await page.getByRole('button', { name: 'Create account' }).waitFor();
const inputs = page.locator('input:visible');
await inputs.nth(0).fill(email);
await inputs.nth(1).fill(username);
await inputs.nth(2).fill(password);
if (!(await page.getByRole('button', { name: 'Create account' }).isDisabled())) throw new Error('sign-up allowed without the AI consent');
await page.getByRole('checkbox', { name: 'I agree' }).click();
await page.getByRole('button', { name: 'Create account' }).click();
await page.getByText('Nothing saved yet').waitFor({ timeout: 15000 });
await page.getByRole('tab', { name: 'Library' }).waitFor();
step('sign-up creates the account and opens an empty library');

// Save a link with a comment, set public
await addLink('Look https://www.youtube.com/shorts/dQw4w9WgXcQ?si=xyz', { comment: 'Lemon pasta for Friday', visibility: 'Public' });
await page.getByText('Saved', { exact: true }).waitFor();
await page.getByPlaceholder('Paste a link…').waitFor({ state: 'detached' }); // the sheet closes
await page.getByText('Lemon pasta for Friday').waitFor();
step('saving a link shows a card with the comment');

// Second link, then a duplicate of the first
await addLink('https://example.com/article?utm_source=wa');
await page.getByText('example.com').first().waitFor();
await addLink('https://youtu.be/dQw4w9WgXcQ', { comment: 'Second note' });
await page.getByText('Already in your library').waitFor();
step('duplicate link is detected and the comment appended');

// Background organizing (needs the enrich function: `supabase functions serve`).
// Without an Anthropic key the worker still fills in the page title and image.
await page.getByText(/Rick Astley/).first().waitFor({ timeout: 45000 });
await page.locator('img[src*="/storage/v1/object/public/thumbnails/"]').first().waitFor({ state: 'attached', timeout: 45000 });
step('links are organized in the background: real title and a stored preview image appear');

// Invalid input
await addLink('lemon pasta');
await page.getByText("That doesn't look like a web link.").waitFor();
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
await page.getByPlaceholder('Paste a link…').waitFor({ state: 'detached' });
step('non-links are rejected with a message; the sheet closes');

// Search tab: by the organized title and by my own comment; nothing for nonsense
await page.getByRole('search').click();
const search = page.getByPlaceholder('Search your library…');
await search.waitFor();
await page.getByText('Search by words, or by meaning').waitFor();
await search.fill('astley');
await page.waitForFunction(() => [...document.querySelectorAll('a[href^="/scrap/"]')].filter((a) => a.offsetParent && !a.closest('[aria-hidden="true"],[inert]')).length === 1);
await page.getByText('Lemon pasta for Friday').first().waitFor();
await search.fill('FRIDAY lemon');
await page.waitForTimeout(800);
if ((await shownCards()) !== 1) throw new Error('comment search should find one scrap');
await search.fill('zzqx nothing');
await page.getByText('Nothing matches your search.').waitFor();
await page.getByRole('button', { name: 'Clear search' }).click();
await page.getByText('Search by words, or by meaning').waitFor();
await tab('Library');
await page.waitForFunction(() => [...document.querySelectorAll('a[href^="/scrap/"]')].filter((a) => a.offsetParent && !a.closest('[aria-hidden="true"],[inert]')).length === 2);
step('search tab finds scraps by title and by my comments; the library shows everything');

// View switcher: grid (default), wide cards, compact list; remembered after a reload
for (const view of ['Cards', 'List', 'Grid']) {
  await viewRadio(view).click();
  const checked = await viewRadio(view).getAttribute('aria-checked');
  if (checked !== 'true') throw new Error(`${view} view not selected`);
  await page.getByText('Lemon pasta for Friday').first().waitFor();
}
await page.screenshot({ path: `${out}/library-grid.png`, fullPage: true });
await viewRadio('List').click();
await page.reload();
await page.getByRole('search').waitFor();
if ((await viewRadio('List').getAttribute('aria-checked')) !== 'true') throw new Error('view choice not remembered');
await page.screenshot({ path: `${out}/library-list.png`, fullPage: true });
await viewRadio('Grid').click();
step('view switcher: grid, cards and list; the choice is remembered');
await page.screenshot({ path: `${out}/library.png`, fullPage: true });

// Detail: comments, edit, visibility
await page.getByText('Lemon pasta for Friday').click();
await page.getByText('Your comments').waitFor();
await page.getByText('Second note').waitFor();
await page.getByPlaceholder('Add a comment…').fill('Use Meyer lemons');
await page.getByRole('button', { name: 'Add' }).click();
await page.getByText('Use Meyer lemons').waitFor();
await page.waitForFunction(() => [...document.querySelectorAll('[role=button]')].filter((e) => e.textContent === 'Edit').length === 3);
await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
await page.locator('textarea:visible').first().fill('Use Meyer lemons, 2 of them');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('Use Meyer lemons, 2 of them').waitFor();
await page.getByText('· edited').waitFor();
await page.getByText('Second note').waitFor();
await page.getByRole('radio', { name: 'Only me' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/detail.png`, fullPage: true });
step('detail page: add and edit comments, change visibility');

// Reload keeps the session and the changes
await page.reload();
await page.getByText('Use Meyer lemons, 2 of them').waitFor();
const checked = await page.getByRole('radio', { name: 'Only me' }).getAttribute('aria-checked');
if (checked !== 'true') throw new Error(`visibility not persisted (aria-checked=${checked})`);
step('reload keeps session, comments and visibility');

// Boards: make one from the scrap, manage them on the boards screen
await page.getByPlaceholder('New board').fill('Weeknight dinners');
await page.getByRole('button', { name: 'Create', exact: true }).click();
await page.getByRole('button', { name: '✓ Weeknight dinners' }).waitFor();
step('a new board made from a scrap has the scrap on it');
await page.goto(`${BASE}/`);
await tab('Boards');
await page.getByText('1 scrap', { exact: true }).waitFor();
await page.getByPlaceholder('Name a new board').fill('Desserts');
await page.getByRole('button', { name: 'Create', exact: true }).click();
await page.getByText('Nothing on this board yet').waitFor();
await page.goto(`${BASE}/boards`);
await page.getByPlaceholder('Name a new board').fill('desserts');
await page.getByRole('button', { name: 'Create', exact: true }).click();
await page.getByText('You already have a board with this name.').waitFor();
await page.getByText('Reorder').click();
await page.getByRole('button', { name: 'Move up' }).last().click();
await page.getByText('Done', { exact: true }).click();
await page.waitForTimeout(500);
await page.reload();
await page.getByText('Desserts').waitFor();
const order = await page.locator('a[href^="/board/"]:visible').allTextContents();
if (!/^\W*Desserts/u.test(order[0] ?? '')) throw new Error(`reorder not saved: ${order.join(' | ')}`);
await page.screenshot({ path: `${out}/boards.png`, fullPage: true });
step('boards screen: counts, create, duplicate name refused, reorder saved');
await page.getByText('Weeknight dinners').click();
await page.getByText('Lemon pasta for Friday').waitFor();
await page.getByRole('button', { name: 'Rename' }).click();
await page.locator('input:visible').first().fill('Friday dinners');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('Friday dinners').first().waitFor();
await page.screenshot({ path: `${out}/board.png`, fullPage: true });
await page.getByText('Lemon pasta for Friday').click();
await page.getByRole('button', { name: '✓ Friday dinners' }).click();
await page.getByRole('button', { name: 'Friday dinners', exact: true }).waitFor();
await page.goBack();
await page.getByText('Nothing on this board yet').waitFor();
step('board page lists its scraps, renames; removing a scrap from a board updates it');

// Delete the other scrap from its detail page
page.on('dialog', (d) => d.accept());
await page.goto(`${BASE}/`);
await page.getByText('example.com').first().click();
await page.getByRole('button', { name: 'Delete scrap' }).click();
await page.getByRole('button', { name: 'Save a link' }).waitFor();
await page.waitForTimeout(500);
if (await page.getByText('example.com/article').count()) throw new Error('deleted scrap still listed');
const cards = await shownCards();
if (cards !== 1) throw new Error(`expected 1 card after delete, got ${cards}`);
step('deleting a scrap removes it from the library');

// Account type change: existing scraps keep their visibility unless asked
await tab('Settings');
await page.getByText(`@${username}`).waitFor();
await page.getByRole('radio', { name: 'Public' }).filter({ visible: true }).click();
await page.getByText("1 of your saved scraps isn't public. Make all your scraps public too?").waitFor();
await page.screenshot({ path: `${out}/settings-suggestion.png`, fullPage: true });
await page.getByRole('button', { name: 'Keep as they are' }).click();
await page.waitForTimeout(300);
if (await page.getByText('Make all your scraps public too?').count()) throw new Error('suggestion not dismissed');
await tab('Library');
await page.getByRole('img', { name: 'Only me' }).waitFor();
if (await page.getByRole('img', { name: 'Public' }).count()) throw new Error('existing scrap changed with the account type');
await addLink('https://example.org/new-after-switch');
await page.getByRole('img', { name: 'Public' }).waitFor();
await page.getByPlaceholder('Paste a link…').waitFor({ state: 'detached' });
step('switching to public keeps existing scraps; new scraps use the new default');

await tab('Settings');
await page.getByText(`@${username}`).waitFor();
await page.getByRole('radio', { name: 'Only me' }).filter({ visible: true }).click();
await page.getByText('1 of your saved scraps is visible to others. Make all your scraps private too?').waitFor();
await page.getByRole('button', { name: 'Make all private' }).click();
await page.getByText('Done — 1 scrap updated.').waitFor();
await page.goto(`${BASE}/`);
await page.getByRole('img', { name: 'Only me' }).first().waitFor();
if (await page.getByRole('img', { name: 'Public' }).count()) throw new Error('bulk change to private did not apply');
step('accepting the suggestion moves all existing scraps to the new mode');

// Settings: Hebrew flips the document to RTL
await tab('Settings');
await page.getByText(`@${username}`).waitFor();
await page.getByRole('radio', { name: 'עברית' }).click();
await page.getByText('התנתקות').waitFor();
const dir = await page.evaluate(() => document.documentElement.dir);
if (dir !== 'rtl') throw new Error(`expected rtl, got ${dir}`);
await page.screenshot({ path: `${out}/settings-he.png`, fullPage: true });
await page.goto(`${BASE}/`);
await page.getByRole('tab', { name: 'הספרייה' }).waitFor();
await page.getByRole('button', { name: 'שמירת קישור' }).click();
await page.getByPlaceholder('הדביקו קישור…').waitFor();
await page.screenshot({ path: `${out}/add-sheet-he.png`, fullPage: true });
await page.getByRole('dialog').getByRole('button', { name: 'סגירה' }).last().click();
await page.screenshot({ path: `${out}/library-he.png`, fullPage: true });
step('switching to Hebrew translates the UI and sets dir=rtl');

// Feedback from Settings
await page.goto(`${BASE}/settings`);
await page.getByPlaceholder('מה קרה, או מה הייתם רוצים?').fill('הכפתור קטן מדי');
await page.getByRole('button', { name: 'שליחה' }).click();
await page.getByText('תודה! המשוב נשלח.').waitFor();
await page.screenshot({ path: `${out}/settings-feedback-he.png`, fullPage: true });
step('feedback is sent from Settings');

// Sign out, then sign back in
await page.goto(`${BASE}/settings`);
await page.getByRole('button', { name: 'התנתקות' }).click();
await page.locator('input:visible').first().waitFor();
await page.locator('input:visible').nth(0).fill(email);
await page.locator('input:visible').nth(1).fill('wrong-password');
await page.getByRole('button').first().click();
await page.getByRole('alert').waitFor();
await page.locator('input:visible').nth(1).fill(password);
await page.getByRole('button').first().click();
await page.getByText('Lemon pasta for Friday').waitFor({ timeout: 15000 });
step('sign-out, wrong password error, sign-in restores the library');

// Mobile width: single column, no horizontal scroll
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: `${out}/library-mobile.png`, fullPage: true });
if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px at phone width`);
step('phone width has no horizontal scroll');

// Delete the account (last: the test user is gone afterwards)
await page.goto(`${BASE}/settings`);
await page.getByRole('button', { name: 'מחיקת החשבון', exact: true }).click();
const forever = page.getByRole('button', { name: 'מחיקת החשבון שלי' });
await page.getByPlaceholder(username, { exact: true }).fill(`@${username.toUpperCase()}`);
await forever.click();
await page.locator('input:visible').nth(1).waitFor({ timeout: 15000 });
await page.locator('input:visible').nth(0).fill(email);
await page.locator('input:visible').nth(1).fill(password);
await page.getByRole('button').first().click();
await page.getByRole('alert').waitFor();
step('deleting the account signs out, and the account no longer signs in');

// An account from before the AI consent is asked once, then reaches its library
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const oldEmail = `e2e_old_${run}@test.local`;
const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: oldEmail, password, data: { username: `e2e_old_${run}`, locale: 'en' } }),
});
if (!signup.ok) throw new Error(`creating the older account failed: ${signup.status}`);
await page.locator('input:visible').nth(0).fill(oldEmail);
await page.locator('input:visible').nth(1).fill(password);
await page.getByRole('button').first().click();
const agree = page.getByRole('button', { name: 'Agree and continue' });
await agree.waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/consent.png`, fullPage: true });
await page.goto(`${BASE}/`);
await agree.waitFor();
await page.getByRole('checkbox', { name: 'I agree' }).click();
await agree.click();
await page.getByText('Nothing saved yet').waitFor({ timeout: 15000 });
step('an older account agrees to the AI services once, then opens its library');

await browser.close();
// Deliberate failures log 400s (wrong password, deleted account), one 403 (signing out a deleted
// account; supabase-js ignores it) and one 409 (duplicate board name).
const relevant = errors.filter((e) => !/favicon|Download the React DevTools/.test(e));
for (const [status, count] of [['status of 400', 2], ['status of 403', 1], ['status of 409', 1]]) {
  const expected = relevant.filter((e) => e.includes(status));
  if (expected.length === count) for (const e of expected) relevant.splice(relevant.indexOf(e), 1);
}
if (relevant.length) {
  console.log('Console errors:\n' + relevant.join('\n'));
  process.exit(1);
}
console.log('ALL PASSED');
