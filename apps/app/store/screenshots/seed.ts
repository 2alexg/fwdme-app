// Resets the demo account and fills it with demo.json in one language, ready
// for the store screenshots. Run from apps/app (capture.sh does this for you):
//   DEMO_EMAIL=… DEMO_PASSWORD=… pnpm exec jiti store/screenshots/seed.ts he
// Deletes every scrap and board of that account first, so never point it at a real one.
import { createClient } from '@supabase/supabase-js';
import {
  addScrapToBoard,
  createBoard,
  deleteBoard,
  deleteScrap,
  getMyProfile,
  giveAiConsent,
  listMyBoards,
  listMyScraps,
  saveScrap,
  signIn,
  updateMyProfile,
  type Database,
  type Locale,
} from '@fwdme/core';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const demo = JSON.parse(fs.readFileSync(path.join(here, 'demo.json'), 'utf8'));
const eas = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'eas.json'), 'utf8'));

const lang = process.argv[2] as Locale;
if (lang !== 'en' && lang !== 'he') throw new Error('usage: seed.ts en|he');
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? '';
if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error('set DEMO_EMAIL and DEMO_PASSWORD');

const env = eas.build.base.env;
const db = createClient<Database>(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// jiti runs this as CommonJS, so no top-level await.
async function main() {
  await signIn(db, DEMO_EMAIL, DEMO_PASSWORD);
  const profile = await getMyProfile(db);
  if (!profile) throw new Error('no profile for the demo account');
  if (!profile.ai_consent_at) await giveAiConsent(db);

  // Start clean: scraps (with their comments) and boards.
  for (const board of await listMyBoards(db)) await deleteBoard(db, board.id);
  for (let page = await listMyScraps(db, profile.id, { limit: 100 }); page.length; page = await listMyScraps(db, profile.id, { limit: 100 })) {
    for (const scrap of page) await deleteScrap(db, scrap.id);
  }

  // The app follows the profile's language on its next start.
  await updateMyProfile(db, profile.id, { locale: lang });

  const scrapByUrl = new Map<string, string>();
  for (const link of demo.links) {
    const saved = await saveScrap(db, { input: link.url, comment: link[lang] });
    scrapByUrl.set(link.url, saved.scrapId);
    // Distinct save times keep the library order stable.
    await new Promise((r) => setTimeout(r, 300));
  }
  for (const board of demo.boards) {
    const { id } = await createBoard(db, board[lang]);
    for (const url of board.links) await addScrapToBoard(db, scrapByUrl.get(url)!, id);
  }
  console.log(`saved ${demo.links.length} links and ${demo.boards.length} boards (${lang})`);

  // Links already organized on an earlier run are ready at once; new ones take a few seconds each.
  const deadline = Date.now() + 3 * 60_000;
  for (;;) {
    const scraps = await listMyScraps(db, profile.id, { limit: 100 });
    const waiting = scraps.filter((s) => ['pending', 'fetching', 'enriching'].includes(s.item.status));
    const failed = scraps.filter((s) => s.item.status === 'failed');
    if (!waiting.length) {
      for (const s of failed) console.warn(`couldn't organize ${s.original_url}: swap it in demo.json`);
      console.log(`organized ${scraps.length - failed.length} of ${scraps.length}`);
      break;
    }
    if (Date.now() > deadline) throw new Error(`still organizing after 3 minutes: ${waiting.map((s) => s.original_url).join(', ')}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
