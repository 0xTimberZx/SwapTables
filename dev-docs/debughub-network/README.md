# DebugHub — SwapTables wiring

SwapTables reports telemetry into the same shared **DebugHub** the rest of the
0xTimberZx ecosystem uses (TimbSwap, 0xFaucet, BlockpotDAO, …). This directory
records how SwapTables is wired; the full pipeline design, operational notes, and
the central hub host live in the **TimbSwap** repo under
[`dev-docs/debughub-network/`](https://github.com/0xTimberZx/TimbSwap/tree/main/dev-docs/debughub-network).

## Architecture (recap)

```
  SwapTables page                      Supabase (PostgREST + RLS)          Hub
  ───────────────                      ──────────────────────────         ─────
  debugger.js v1.2.0  ──POST anon──▶   public.debughub_events   ◀──GET──  MyDapp hub
   (+ localStorage fallback)            anon INSERT (whitelist)           debughub/index.html
                                        anon SELECT (read-only)             (local, this repo)
```

- **SDK** is loaded cross-origin from the MyDapp hub host, exactly like the
  TimbSwap pages — it is **not** vendored here:
  `https://0xtimberzx.github.io/MyDapp/debughub/sdk/debugger.js?v=1.2.0`.
- **localStorage** stays as an offline fallback, so nothing breaks if the backend
  is unreachable.

## What's wired in this repo

1. **`prototype/board.html`** — sets `window.DEBUGHUB_CONFIG` (`appName:
   "SwapTables"` + `supabaseUrl`/`supabaseKey`), loads the SDK, installs a
   fallback stub, and emits a page-load checkpoint. Real `app/` pages should
   repeat the same head block once they exist.
2. **`debughub/index.html`** — the same-origin **local dashboard** (a SwapTables
   copy of TimbSwap's), reading `SwapTables_sessions` from this browser's
   localStorage. The no-backend "works right now" view, complementary to the
   aggregated remote hub.
3. **`schema.sql`** — a mirror of the shared table definition with `'SwapTables'`
   added to the app whitelist (see below).

## Shared-backend action required ⚠️

The Supabase `debughub_events` table gates INSERTs by an app whitelist (RLS). It
does **not** yet include `SwapTables`, so until the whitelist is widened,
SwapTables' anon INSERTs are rejected (`42501`) and the SDK silently falls back
to localStorage — the local dashboard works, but SwapTables won't appear in the
aggregated hub.

To activate remote telemetry, apply a migration to project
`ipyfodnidwsdvwqrcjrl` that adds `'SwapTables'` to both the CHECK constraint and
the `debughub_anon_insert` policy, as shown in [`schema.sql`](./schema.sql).

## Security model

- The **anon key is public by design** (embedded in client JS). RLS is the
  boundary: anon may only `INSERT` events for whitelisted apps and `SELECT`
  diagnostics — no update/delete.
- **No secrets are ever logged** — checkpoints, error codes/messages, wallet
  *addresses*, and chain id only. Never keys or seed phrases.
- Free-text fields are length-capped (`message` ≤ 2000, `name` ≤ 200) at both the
  SDK and DB layers.
