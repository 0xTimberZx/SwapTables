# Generation 5 — adaptive entry + late loading

Draft, 2026-07-31. **Spec for review; nothing built.** Written from two live
stream sessions (Twitch, Kick) and the gen-4 smoke test, where the failure mode
was never the maths — it was people sitting around waiting for clocks.

Gen-4 cut a round from ~60 to ~25 minutes by changing three constructor dials.
That was the interim fix and it worked, but it is still a *fixed* schedule: a
table with everyone seated and funded in three minutes still waits out the full
15-minute entry window. Gen-5 makes the schedule follow the players.

## Scope — three changes

Held to the house rule of one *accounting* change per generation: none of these
touch how money is held or settled. They change **when a table advances**.

1. **Adaptive entry** — entry closes early once the table has quorum and goes
   quiet, instead of always burning the full window.
2. **Late loading** — a seated wallet can fund its six tokens right up to
   bets-close, not just during entry.
3. **Arm on funded seats** — `armTable` requires two *loaded* wallets, not two
   seated ones.

---

## 1. Adaptive entry

### The problem

`entryWindow` is a fixed span from `openedAt`. Whether two players load in 90
seconds or nobody shows, the table waits the same. On stream that is dead air,
and dead air is what made both sessions drag.

### The rule

Entry closes at the **earliest** of:

| Trigger | When | Why |
|---|---|---|
| **Quiet quorum** | `lastSitAt + SIT_QUIET` once **2+ wallets are loaded** | the table is playable and nobody new has arrived — go |
| **Lone player** | `firstLoadAt + SOLO_WAIT` while exactly **1** wallet is loaded | don't strand a single funded player waiting for company |
| **Hard ceiling** | `openedAt + ENTRY_MAX` | the table can never hang open |

**Every new sit pushes the quiet timer out again** — a table that keeps
attracting players keeps its doors open. This is the operator's ask verbatim:
*"every new sit pushes that timer to 5 mins so they can be swiftly acquainted."*

Once entry closes, the rest of the schedule is derived from that moment:

```
entryCloseAt  = (as above)
betsCloseAt   = entryCloseAt + PLACE_WINDOW
pickTime      = betsCloseAt  + COMMIT_LEAD
```

### Proposed dials (all constructor args, per generation)

| Dial | Value | Note |
|---|---|---|
| `SIT_QUIET` | 5 min | quiet period after the last sit, once 2+ are loaded |
| `SOLO_WAIT` | 15 min | max wait for a lone funded player |
| `ENTRY_MAX` | 40 min | hard ceiling on entry |
| `PLACE_WINDOW` | 5 min | entry close → bets close (board is open for placing) |
| `COMMIT_LEAD` | 2 min | bets close → pick (the committed drumroll) |
| `ROUND_MAX` | 45 min | ceiling on the whole round, for the operator board |

Best case: two players seated and loaded at 2:00 → entry closes 7:00, bets close
12:00, pick 14:00, six staggered reveals ≈ 15:30. **A round in about a quarter
of an hour**, versus 25 fixed on gen-4 and 60 on gen-3.

### Implementation note — store it, don't derive it

`entryCloseAt` must be a **stored field**, written on sit/load, not computed on
read. Deriving it invites a nasty edge: when `loadedCount` goes 1 → 2, the
governing rule switches from `firstLoadAt + SOLO_WAIT` to
`lastSitAt + SIT_QUIET`, which can evaluate *earlier* than the previous answer —
retroactively closing a window players were still using. Storing it and only
ever writing a future timestamp makes the schedule monotonic and auditable.

Writes land inside `sit` / `loadTokens`, which are already paying gas.

### New table state

```solidity
uint64 entryCloseAt;   // authoritative; initialised to openedAt + ENTRY_MAX
uint64 lastSitAt;      // resets the quiet timer
uint64 firstLoadAt;    // starts the lone-player clock
uint8  loadedCount;    // wallets that have funded six tokens
```

`pickTime` becomes **derived and mutable** until entry closes — today it is
fixed at `openTable`. That is the single biggest ripple in this generation
(see *App impact*).

---

## 2. Late loading

### The problem, seen live

A wallet sat during entry but never funded. Once entry closed it could no longer
load — and because `place` requires `chipPack != 0`, it also could not bet. It
occupied a seat for the whole round contributing nothing. The felt made this
worse by still showing *"Ready — one transaction, 185 TIMBS"*; that hint is
fixed in gen-4's app (commit `738533b`), but the underlying window is a contract
rule.

### Why the current guard is stricter than it needs to be

`loadTokens` and `sit` share one guard:

```solidity
if (block.timestamp >= t.openedAt + entryWindow) revert TableClosedForEntry();
```

But loading only *funds* tokens. **Placing** is what commits chips to a pool,
and `place` already has its own, later deadline:

```solidity
if (block.timestamp + betsCloseLead >= t.pickTime) revert BetsClosed();
```

So nothing about pool composition depends on loading having stopped at entry —
composition is not final until bets close either way. The early guard buys no
safety; it only strands people.

### The change

Move `loadTokens` onto the **bets-close** deadline, leaving `sit` on entry:

```solidity
// loadTokens — was: openedAt + entryWindow
if (block.timestamp + COMMIT_LEAD >= t.pickTime) revert BetsClosed();
```

Reading: **you must be seated before entry closes, but you can fund any time
before bets close.** A late-arriving seat can still get its six bets down.

Unchanged: `AlreadyLoaded` (still one load per wallet), `NotSeated`, chip
validation, and the ledger `collect` path.

---

## 3. Arm on funded seats

`armTable` currently checks `seatCount >= SEATS_MIN`. Tonight's table proved
that counts wallets that never sent a chip, so a table can arm on two seats
where only one has money at stake — and the §9 seed guard (a pool draws its seed
share only with 2+ distinct wallets) can then fail on a table that "had quorum".

```solidity
if (t.loadedCount < SEATS_MIN) revert NotEnoughSeats(t.loadedCount, SEATS_MIN);
```

`loadedCount` already exists for adaptive entry, so this is one line. It also
makes the quorum trigger in §1 and the arm check agree on what "enough players"
means, which they currently do not.

---

## App impact

- **ABI change.** `tables()` gains `entryCloseAt` / `loadedCount`. Every consumer
  updates: `onchain/abi/`, and the `ADDR`/phase logic in
  `app/{index,play,live}.html`.
- **`phaseOf()` stops using global dials.** The felt, console and stream all
  compute phases from `entryWindow` / `betsCloseLead` read once at connect. With
  adaptive entry these become **per-table**, so phase logic must read
  `entryCloseAt` and `pickTime` off the table struct. This touches the stream
  director's hold policy (`holdReason`) too — but only in where it sources the
  marks, not what it decides.
- **The console's Tables board gets better, not worse.** Its "what is this table
  waiting for" column becomes genuinely useful: *"needs 1 more funded wallet"*,
  *"closing in 2:14 unless someone sits"*.
- **Auto-pilot is unaffected** — it polls the table and acts when the contract
  allows; a moving `pickTime` is already handled.

## Deploy shape

Same generation dance as gen-3 → gen-4: redeploy `SegmentBoard`, `PoolLedger`,
`CommitRevealEntropy`; **reuse** `SeedRegistry` and the generation-agnostic
`SegmentCrank`; re-run the two wiring transactions. `FAST_DIALS_DEPLOY.md` is
the working runbook — only the env dials and the contract build change.

Unlike gen-4 this **is** a Solidity change, so it wants unit tests before it
goes near a stream: the monotonicity of `entryCloseAt`, each of the three close
triggers, late-load-then-place inside the window, late-load rejected after
bets close, and arm refusing a table of unfunded seats.

## Open questions

1. **Does `SOLO_WAIT` open a table that cannot arm?** A lone funded player hits
   entry close, places bets, and then arm reverts on `loadedCount < 2`. The
   table is stuck until cancel. Options: refuse to close entry below quorum and
   let `ENTRY_MAX` handle it, or auto-cancel at pick time. Leaning toward the
   latter — the operator board can surface *"cancel: never filled"* as it does
   now, and auto-pilot could fire it.
2. **Should a sit after quorum extend the timer indefinitely?** Currently capped
   only by `ENTRY_MAX`. A steady trickle of sits could hold a table open for the
   full 40 minutes — which is arguably correct (people are joining), but on
   stream it re-creates the dead air this generation exists to kill.
3. **Does `ENTRY_MAX` still belong at 40 minutes** now that the adaptive path
   makes it a rare fallback rather than the norm?
