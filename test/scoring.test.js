import { test } from "node:test";
import assert from "node:assert/strict";
import { settleHand } from "../src/scoring.js";

// Pairwise reference implementation from the rules: every pair of players
// settles the difference in scores, and each opponent pays the winner 3/10
// (+5 for a dublee win).
function pairwise({ players, winnerId, dubleeWin }) {
  const score = (p) => (p.id === winnerId || p.seen ? p.maal : 0);
  const net = Object.fromEntries(players.map((p) => [p.id, 0]));
  for (const a of players) {
    for (const b of players) {
      if (a === b) continue;
      net[a.id] += score(a) - score(b);
    }
  }
  for (const p of players) {
    if (p.id === winnerId) continue;
    const w = (p.seen ? 3 : 10) + (dubleeWin ? 5 : 0);
    net[p.id] -= w;
    net[winnerId] += w;
  }
  return net;
}

test("matches the worked example from the rules", () => {
  // A, B, C, D scores; C wins; A has seen the joker.
  const [A, B, C, D] = [12, 5, 8, 20];
  const players = [
    { id: "a", seen: true, maal: A },
    { id: "b", seen: true, maal: B },
    { id: "c", seen: true, maal: C },
    { id: "d", seen: true, maal: D },
  ];
  const net = settleHand({ players, winnerId: "c", dubleeWin: false });
  assert.equal(-net.a, A + B + C + D + 3 - 4 * A);
});

test("streamlined method equals pairwise payments", () => {
  const cases = [
    {
      players: [
        { id: "a", seen: true, maal: 12 },
        { id: "b", seen: false, maal: 30 },
        { id: "c", seen: true, maal: 8 },
        { id: "d", seen: true, maal: 0 },
      ],
      winnerId: "c",
      dubleeWin: false,
    },
    {
      players: [
        { id: "a", seen: true, maal: 3 },
        { id: "b", seen: true, maal: 17 },
        { id: "c", seen: false, maal: 0 },
      ],
      winnerId: "a",
      dubleeWin: true,
    },
  ];
  for (const hand of cases) {
    assert.deepEqual(settleHand(hand), pairwise(hand));
  }
});

test("net points always sum to zero", () => {
  const net = settleHand({
    players: [
      { id: "a", seen: true, maal: 25 },
      { id: "b", seen: false, maal: 9 },
      { id: "c", seen: true, maal: 4 },
      { id: "d", seen: false, maal: 0 },
      { id: "e", seen: true, maal: 11 },
    ],
    winnerId: "e",
    dubleeWin: true,
  });
  assert.equal(Object.values(net).reduce((s, v) => s + v, 0), 0);
});

test("unseen players' maal counts as zero", () => {
  const net = settleHand({
    players: [
      { id: "a", seen: true, maal: 0 },
      { id: "b", seen: false, maal: 50 },
    ],
    winnerId: "a",
    dubleeWin: false,
  });
  assert.deepEqual(net, { a: 10, b: -10 });
});
