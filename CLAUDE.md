# UniBot

WhatsApp bot for a university class group (AzTU): schedules, lesson reminders, AI replies, stickers, PDF conversion and a quiz game. NestJS app, deployed with Docker on a VPS.

## Commands

- `pnpm dev` — run locally (scan the WhatsApp QR printed in the terminal)
- `pnpm test` — Vitest, single run. Use `pnpm vitest run <file>` while working; never start watch mode.
- `pnpm check` — the final verification (greenly: tsc, oxfmt, oxlint, vitest, build). Run `pnpm fmt` first.
- `pnpm db:push` — sync `prisma/schema.prisma` to the database (touches the real Neon DB, ask first)

## Development workflow (test driven)

- **Bug or regression reported:** first write a test that reproduces it and run it to confirm it **fails**. Then fix the source code and confirm the test **passes**. Never adjust the test to match the buggy behaviour.
- **New feature requested:** implement the feature first, then write tests covering it (happy path and edge cases).
- Finish every task with `pnpm fmt` and `pnpm check`.

## Architecture

- `src/lib/whatsapp.ts` — the only file that knows Baileys. A whatsapp-web.js style wrapper (`Client`, `Chat`, `GroupChat`, `Message`, `MessageMedia`, `MessageTypes`) that the rest of the code uses. Keep Baileys details inside it.
- `src/modules/bot/client.ts` — the shared `Client` singleton.
- `src/modules/bot/bot.service.ts` — routes incoming messages to handlers/services and runs the cron jobs (door-number reminders, daily schedule post).
- `src/modules/bot/handlers/` — ai (OpenRouter via AI SDK, with schedule tools), help, pdf (Adobe PDF Services), sticker, quote.
- `src/modules/{schedule,calendar,game}/` — schedule texts, Google Calendar access, the 3sual quiz game (Prisma `GameSession`).
- `src/lib/constants.ts` — env derived ids, and the semester config: `SHIFT` (`SHIFTS.morning` / `SHIFTS.afternoon`) `SCHOOL_DAYS` (5 = Mon–Fri, 4 = Mon–Thu) and `UPPER_WEEKS` (`"odd"` / `"even"` ISO weeks). All cron times and calendar windows derive from these.
- `src/lib/utils.ts` — `commands` and `getCommand()` (whole-word command matching), `cleanPrompt()`, date helpers.
- `deprecated/` — retired features, excluded from tsc, lint and build. Don't import from it.

## Conventions and gotchas

- **User ids are LIDs** (`…@lid`); a phone number jid (`…@s.whatsapp.net`) is only a fallback. Phone numbers from `.env` (`UNIBOT_PHONE_NUMBER`, `BOT_OWNER_PHONE_NUMBER`) must be compared via `await client.getLid(...)`. Groups are `…@g.us`.
  - **Bot owner ≠ group owner:** `BOT_OWNER_PHONE_NUMBER` / `BotOwnerID` is the developer's own number; `/echo`, `/confirm` and private `/unibot` are for them only. A participant's `isSuperAdmin` is WhatsApp's group owner, unrelated.
- **Only live messages are handled.** History sync is off and messages older than the connection are ignored. The in-memory message store is bounded (20 messages per chat, 100 chats).
- **Commands:** add new ones to `commands` in `utils.ts`; retired ones are commented out there, not deleted. Keep the help boxes (`src/lib/messages.ts`) and the AI command list (`ai.handler.ts`) in sync.
- **Game:** messages are handled concurrently, so advancing or ending a game goes through a conditional `updateMany` (first message wins). `GameService` keeps active games in memory; restart the bot after editing `GameSession` rows by hand.
- **Prisma:** after changing `schema.prisma`, run `pnpm prisma generate` before `pnpm check` (tsc runs before the build step regenerates the client).
- **Time zone:** everything assumes `TZ=Asia/Baku` (validated in `src/lib/env.ts`).
- **Deploy:** `cmd/deploy.sh` syncs `~/unibot` with `origin/main` and rebuilds the Docker image. The server `.env` must be in Docker `--env-file` format (no quotes, single-line JSON).
  - `.baileys_auth` only exists inside the container, so every deploy re-links the bot (new QR scan, new keys).
- `.gitignore` uses CRLF line endings; source files use LF. Preserve them when editing.

### Decided, not issues (don't raise again)

- **Group caches don't go stale across reconnects.** `groupCache`/`participantsCache` in `whatsapp.ts` are cleared by `groups.update` / `group-participants.update`, and WhatsApp delivers changes missed while disconnected as queued `offline` notifications on reconnect, which Baileys turns into the same events. Don't clear them on reconnect. They're needed (Baileys' `cachedGroupMetadata` avoids a metadata query per group send) and small (one entry per active group).
- **No `--restart` policy in `deploy.sh`:** a broken deploy would restart forever.
- **A failing `ready` handler crashes the bot on purpose** (e.g. `getChatById(UNICHAT)`), so the failure is visible.
- **`uniMates` is fixed at startup:** UniChat membership rarely changes and the owner restarts the bot when it does.

## Tests

- `tests/` mirrors `src/` (e.g. `src/modules/game/game.service.ts` → `tests/modules/game/game.service.test.ts`). Shared fakes (chats, messages, in-memory Prisma) are in `tests/fakes.ts`.
- `vitest.config.ts` sets fake values for every env variable, and `tests/setup.ts` disables `dotenv`, so the real `.env` is never read.
- Mock only external boundaries (Baileys socket, Google Calendar, AI model, Prisma, Adobe, HTTP) and test real code otherwise. Use the `vi.mock(import("..."))` form. AI tests run the real `generateText` against `MockLanguageModelV4` from `ai/test`.
- Assert on behaviour (what is sent, replied, reacted, stored), not on internal calls. Use `test.for` for input tables and short test names.
- `restoreMocks` is on; use fake timers (`vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime`) for date dependent code.
