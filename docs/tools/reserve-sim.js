#!/usr/bin/env node
/**
 * Two-regime solvency simulation for M3 (la partage) and dead-pot stake-back,
 * against the gen-6 flow of funds AS DEPLOYED — settle path read out of
 * SegmentBoard._settlePool/_underwrite/retire and UnderwriteReserve, not out of
 * the design doc.
 *
 * Everything is in whole TIMBS (the contracts work in 1e18; the ratios are the
 * same and the numbers stay readable).
 */

// ── constants, lifted from the contracts ────────────────────────────────────
const SEATS_MAX = 12, POOLS = 7, DD_POOL = 6, SEGMENTS = 6;
const TABLE_SEED = 100, SEED_SHARE = TABLE_SEED / POOLS;   // ~14.2857
const SEED_MIN_WALLETS = 2;
const RAKE_BASE = 800, RAKE_FLOOR = 175, BPS = 10000;
const PAYOUT_RATIO = 0.90;
const MAX_POOL_UNDERWRITE = Number(process.env.PC || 1000), MAX_ROUND_UNDERWRITE = Number(process.env.RC || 1500);
const MAX_RESERVE_FRACTION = Number(process.env.FR || 0.10);
const FLOAT_TARGET = Number(process.env.FT || 4500);
const CHIPS = [5, 10, 25, 50, 100, 500, 1000];

// kind -> [fair weight (w:1), P(win)]  — 36 symbols
const KINDS = {
  EXACTLY:   { w: 35,     p: 1/36  },
  YOURTICKET:{ w: 35,     p: 1/36  },
  COLUMN:    { w: 2,      p: 12/36 },
  DOZEN:     { w: 2,      p: 12/36 },
  VOWELS:    { w: 5,      p: 6/36  },
  COLOR:     { w: 1,      p: 18/36 },
  LOWHIGH:   { w: 1,      p: 18/36 },
  LETTER:    { w: 10/26,  p: 26/36 },
  NUMBER:    { w: 26/10,  p: 10/36 },
};
const PICKS = { EXACTLY: 36, YOURTICKET: 1, COLUMN: 3, DOZEN: 3, VOWELS: 1,
                COLOR: 2, LOWHIGH: 2, LETTER: 1, NUMBER: 1 };

// One real locked character (index 0..35 = A..Z then 0..9) decides EVERY bet in
// a pool, exactly as _wins does on chain. That correlation is the whole reason
// dead pots cluster and winner-heavy rounds pay several people at once —
// resolving each bet independently would wash it out and flatter every
// mechanism under test. Your-Ticket is the one genuinely per-wallet bet: it
// resolves against that wallet's own ticket character, so it stays independent.
const VOWEL_IDX = new Set([0, 4, 8, 14, 20, 24]);   // A E I O U Y
function wins(kind, pick, idx) {
  switch (kind) {
    case "EXACTLY":    return pick === idx;
    case "YOURTICKET": return rnd() < 1/36;
    case "COLUMN":     return pick === idx % 3;
    case "DOZEN":      return pick === Math.floor(idx / 12);
    case "VOWELS":     return VOWEL_IDX.has(idx);
    case "COLOR":      return pick === idx % 2;       // alternating red/black
    case "LOWHIGH":    return pick === (idx < 18 ? 0 : 1);
    case "LETTER":     return idx < 26;
    case "NUMBER":     return idx >= 26;
  }
  throw new Error("bad kind " + kind);
}

// ── regimes ─────────────────────────────────────────────────────────────────
// Same table sizes and chips; what changes is WHAT people bet.
const REGIMES = {
  "winner-heavy": { // crowds on short odds — most pools pay, few forfeits
    mix: ["COLOR", "COLOR", "LOWHIGH", "LOWHIGH", "LETTER", "COLUMN", "DOZEN", "NUMBER"],
  },
  "loser-heavy": {  // spread long shots — pools die often
    mix: ["EXACTLY", "EXACTLY", "YOURTICKET", "VOWELS", "NUMBER", "COLUMN", "DOZEN", "EXACTLY"],
  },
};

// ── deterministic RNG so runs are comparable ────────────────────────────────
let seed = 0x9e3779b9;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];

/**
 * One table.
 * @param mode  "base" | "partage" | "partage-overflow" | "stakeback"
 *   base             — gen-6 as deployed: dead pots whole to the reserve
 *   partage          — contested dead pool: half back to its bettors off the top
 *   partage-overflow — same half-back, but PAID OUT OF THE OVERFLOW EARMARK, which
 *                      is what GAME_ECONOMY's farm-resistance table actually
 *                      specifies ("only from waterfall overflow — an empty
 *                      reserve pays no half-backs"). Income is untouched; the
 *                      half-back is simply skipped when the earmark is dry.
 *   stakeback        — contested dead pool: every stake back, nothing to the reserve
 */
function playTable(regime, mode, reserveBalance, overflow) {
  const seats = 4 + Math.floor(rnd() * 9);            // 4..12
  const wallets = Array.from({length: seats}, (_, i) => i);

  // each seat loads six chips and places all six
  const bets = Array.from({length: POOLS}, () => []);
  for (const w of wallets) {
    for (let seg = 0; seg < SEGMENTS; seg++) {
      const kind = pick(regime.mix);
      bets[seg].push({ w, kind, pick: Math.floor(rnd() * PICKS[kind]),
                       stake: CHIPS[Math.floor(rnd() * 5)] });   // 5..100
    }
    if (rnd() < 0.5) bets[DD_POOL].push({ w, kind: "DOUBLEDIGIT", pick: 0,
                                          stake: CHIPS[Math.floor(rnd() * 5)] });
  }

  let rakeAccrued = 0, deadAccrued = 0, roundUsed = 0;
  let toPlayers = 0, backToPlayers = 0, granted = 0, wantedTotal = 0;

  for (let pool = 0; pool < POOLS; pool++) {
    const bs = bets[pool];
    const n = bs.length;
    if (n === 0) continue;

    const contested = n >= SEED_MIN_WALLETS;
    const pot = bs.reduce((s, b) => s + b.stake, 0) + (contested ? SEED_SHARE : 0);
    const rakeBps = contested ? RAKE_FLOOR + (RAKE_BASE - RAKE_FLOOR) / n : 0;
    const distributable = pot * (BPS - rakeBps) / BPS;

    // resolve: one locked character per pool decides every bet in it
    let winners;
    if (pool === DD_POOL) {
      const hit = rnd() < 0.356;                       // 1 - (35·34·33·32·31)/36^5
      winners = hit ? bs.map((_, i) => i) : [];
    } else {
      const idx = Math.floor(rnd() * 36);
      winners = [];
      for (let i = 0; i < n; i++) if (wins(bs[i].kind, bs[i].pick, idx)) winners.push(i);
    }

    if (winners.length === 0) {
      // ── dead pot ──
      if (mode === "base" || !contested) { deadAccrued += pot; }
      else if (mode === "partage")       { backToPlayers += pot / 2; deadAccrued += pot / 2; }
      else if (mode === "stakeback")     { backToPlayers += pot; }
      else if (mode === "partage-overflow") {
        deadAccrued += pot;                       // income untouched
        const half = Math.min(pot / 2, overflow); // the earmark is the whole budget
        overflow -= half; reserveBalance -= half;
        backToPlayers += half;
      }
      continue;
    }

    const totalWeight = winners.reduce((s, i) =>
      s + bs[i].stake * (pool === DD_POOL ? 1.8 : KINDS[bs[i].kind].w), 0);
    let distributed = 0;
    const pay = {};
    for (const i of winners) {
      const wgt = bs[i].stake * (pool === DD_POOL ? 1.8 : KINDS[bs[i].kind].w);
      pay[i] = distributable * wgt / totalWeight;
      distributed += pay[i];
    }
    toPlayers += distributed;
    rakeAccrued += pot - distributed;

    // ── M1 underwrite (DD is never underwritten) ──
    if (pool !== DD_POOL) {
      let capLeft = MAX_POOL_UNDERWRITE, wanted = 0;
      for (const i of winners) {
        const target = bs[i].stake * (KINDS[bs[i].kind].w + 1) * PAYOUT_RATIO;
        if (pay[i] >= target) continue;
        const want = Math.min(target - pay[i], capLeft);
        wanted += want; capLeft -= want;
      }
      if (wanted > 0) {
        wantedTotal += wanted;
        const roundLeft = Math.max(0, MAX_ROUND_UNDERWRITE - roundUsed);
        const free = Math.max(0, reserveBalance - overflow);
        const g = Math.min(wanted, roundLeft, free * MAX_RESERVE_FRACTION, free);
        if (g > 0) { roundUsed += g; granted += g; reserveBalance -= g; toPlayers += g; }
      }
    }
  }

  // ── retire ──
  const rakeHalf = rakeAccrued / 2;
  const toReserve = deadAccrued + rakeHalf;
  const toTreasury = rakeAccrued - rakeHalf;     // + unconsumed seed shares, ignored
  reserveBalance += toReserve;

  // waterfall: fill the float, park the rest
  const free = reserveBalance - overflow;
  if (free > FLOAT_TARGET) overflow += free - FLOAT_TARGET;

  return { reserveBalance, overflow, granted, wantedTotal, toReserve, toTreasury,
           toPlayers, backToPlayers, seats };
}

function run(regimeName, mode, rounds = 4000, start = FLOAT_TARGET) {
  seed = 0x9e3779b9;                                  // same tables every mode
  const regime = REGIMES[regimeName];
  let bal = start, overflow = 0;
  let granted = 0, wanted = 0, income = 0, treasury = 0, back = 0;
  let minFloat = Infinity, starved = 0, asked = 0;
  for (let r = 0; r < rounds; r++) {
    const o = playTable(regime, mode, bal, overflow);
    bal = o.reserveBalance; overflow = o.overflow;
    granted += o.granted; wanted += o.wantedTotal; income += o.toReserve;
    treasury += o.toTreasury; back += o.backToPlayers;
    if (o.wantedTotal > 0){ asked++; if (o.granted < o.wantedTotal * 0.99) starved++; }
    minFloat = Math.min(minFloat, bal - overflow);
  }
  return {
    net: (bal + overflow - start) / rounds,           // reserve delta per round
    grant: granted / rounds,
    want: wanted / rounds,
    coverage: wanted > 0 ? 100 * granted / wanted : 100,
    income: income / rounds,
    treasury: treasury / rounds,
    back: back / rounds,
    endFloat: bal - overflow,
    minFloat,
    overflow,
    shortRounds: asked ? 100 * starved / asked : 0,
  };
}

const f = n => (n >= 0 ? "+" : "") + n.toFixed(1);
const MODES = ["base", "partage-overflow", "partage", "stakeback"];
const NAME = { base: "gen-6 as deployed", partage: "M3, off the top",
               "partage-overflow": "M3, overflow-funded",
               stakeback: "dead-pot stake-back" };

for (const regimeName of Object.keys(REGIMES)) {
  console.log("\n### " + regimeName);
  console.log("mode                  reserve/rnd  topups/rnd   wanted/rnd  covered  income/rnd  back/rnd  end float  min float  overflow  short rnds");
  for (const mode of MODES) {
    const r = run(regimeName, mode);
    console.log(
      NAME[mode].padEnd(21),
      f(r.net).padStart(11),
      r.grant.toFixed(1).padStart(11),
      r.want.toFixed(1).padStart(12),
      (r.coverage.toFixed(1) + "%").padStart(8),
      r.income.toFixed(1).padStart(11),
      r.back.toFixed(1).padStart(9),
      r.endFloat.toFixed(0).padStart(10),
      r.minFloat.toFixed(0).padStart(10),
      r.overflow.toFixed(0).padStart(9),
      (r.shortRounds.toFixed(0) + "%").padStart(11));
  }
}

