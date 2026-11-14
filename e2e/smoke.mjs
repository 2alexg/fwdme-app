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
await page.getByRole('button', { name: 'Create account' }).click();
await page.getByPlaceholder('Paste a link…').waitFor({ timeout: 15000 });
await page.getByText('Nothing saved yet').waitFor();
step('sign-up creates the account and opens an empty library');

// Save a link with a comment, set public
await page.getByPlaceholder('Paste a link…').fill('Look https://www.youtube.com/shorts/dQw4w9WgXcQ?si=xyz');
await page.getByPlaceholder('Why are you saving it? (optional)').fill('Lemon pasta for Friday');
await page.getByRole('radio', { name: 'Public' }).click();
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('Saved', { exact: true }).waitFor();
await page.getByText('Lemon pasta for Friday').waitFor();
step('saving a link shows a card with the comment');

// Second link, then a duplicate of the first
await page.getByPlaceholder('Paste a link…').fill('https://example.com/article?utm_source=wa');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('example.com').first().waitFor();
await page.getByPlaceholder('Paste a link…').fill('https://youtu.be/dQw4w9WgXcQ');
await page.getByPlaceholder('Why are you saving it? (optional)').fill('Second note');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('Already in your library').waitFor();
step('duplicate link is detected and the comment appended');

// Invalid input
await page.getByPlaceholder('Paste a link…').fill('lemon pasta');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText("That doesn't look like a web link.").waitFor();
await page.getByPlaceholder('Paste a link…').fill('');
step('non-links are rejected with a message');
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

// Delete the other scrap from its detail page
page.on('dialog', (d) => d.accept());
await page.goto(`${BASE}/`);
await page.getByText('example.com').first().click();
await page.getByRole('button', { name: 'Delete scrap' }).click();
await page.getByPlaceholder('Paste a link…').waitFor();
await page.waitForTimeout(500);
if (await page.getByText('example.com/article').count()) throw new Error('deleted scrap still listed');
const cards = await page.locator('a[href^="/scrap/"]').count();
if (cards !== 1) throw new Error(`expected 1 card after delete, got ${cards}`);
step('deleting a scrap removes it from the library');

// Account type change: existing scraps keep their visibility unless asked
await page.getByText('Settings').filter({ visible: true }).click();
await page.getByText(`@${username}`).waitFor();
await page.getByRole('radio', { name: 'Public' }).filter({ visible: true }).click();
await page.getByText("1 of your saved scraps isn't public. Make all your scraps public too?").waitFor();
await page.screenshot({ path: `${out}/settings-suggestion.png`, fullPage: true });
await page.getByRole('button', { name: 'Keep as they are' }).click();
await page.waitForTimeout(300);
if (await page.getByText('Make all your scraps public too?').count()) throw new Error('suggestion not dismissed');
await page.goto(`${BASE}/`);
await page.getByText('🔒 Only me').waitFor();
if (await page.getByText('🌐 Public').count()) throw new Error('existing scrap changed with the account type');
await page.getByPlaceholder('Paste a link…').fill('https://example.org/new-after-switch');
await page.getByRole('button', { name: 'Save' }).click();
await page.getByText('🌐 Public').waitFor();
step('switching to public keeps existing scraps; new scraps use the new default');

await page.getByText('Settings').filter({ visible: true }).click();
await page.getByText(`@${username}`).waitFor();
await page.getByRole('radio', { name: 'Only me' }).filter({ visible: true }).click();
await page.getByText('1 of your saved scraps is visible to others. Make all your scraps private too?').waitFor();
await page.getByRole('button', { name: 'Make all private' }).click();
await page.getByText('Done — 1 scrap updated.').waitFor();
await page.goto(`${BASE}/`);
await page.getByText('🔒 Only me').first().waitFor();
if (await page.getByText('🌐 Public').count()) throw new Error('bulk change to private did not apply');
step('accepting the suggestion moves all existing scraps to the new mode');

// Settings: Hebrew flips the document to RTL
await page.getByText('Settings').click();
await page.getByText(`@${username}`).waitFor();
await page.getByRole('radio', { name: 'עברית' }).click();
await page.getByText('התנתקות').waitFor();
const dir = await page.evaluate(() => document.documentElement.dir);
if (dir !== 'rtl') throw new Error(`expected rtl, got ${dir}`);
await page.screenshot({ path: `${out}/settings-he.png`, fullPage: true });
await page.goto(`${BASE}/`);
await page.getByPlaceholder('הדביקו קישור…').waitFor();
await page.screenshot({ path: `${out}/library-he.png`, fullPage: true });
step('switching to Hebrew translates the UI and sets dir=rtl');

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

await browser.close();
// The deliberate wrong-password attempt logs one 400 from the auth API.
const relevant = errors.filter((e) => !/favicon|Download the React DevTools/.test(e));
const badRequests = relevant.filter((e) => e.includes('status of 400'));
if (badRequests.length === 1) relevant.splice(relevant.indexOf(badRequests[0]), 1);
if (relevant.length) {
  console.log('Console errors:\n' + relevant.join('\n'));
  process.exit(1);
}
console.log('ALL PASSED');
