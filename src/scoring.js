// Settlement math for one hand of Marriage.
//
// All payments go to and from the winner. For each other player:
//   pays = T + w - n * S
// where T is the sum of all players' scores, S is this player's score,
// n is the number of players, and w is 3 (saw the joker) or 10 (did not),
// plus 5 if the winner ended the game with 8 dublees.
// A negative amount means the winner pays that player.

export const SEEN_PENALTY = 3;
export const UNSEEN_PENALTY = 10;
export const DUBLEE_BONUS = 5;

/**
 * @param {object} hand
 * @param {{id: string, seen: boolean, maal: number}[]} hand.players
 * @param {string} hand.winnerId
 * @param {boolean} hand.dubleeWin
 * @returns {Record<string, number>} net points per player id (positive = gained)
 */
export function settleHand({ players, winnerId, dubleeWin }) {
  if (!players.some((p) => p.id === winnerId)) {
    throw new Error("Winner must be one of the players");
  }
  const n = players.length;
  // House rule: a player who did not see the joker scores no maal.
  // The winner always counts as having seen the joker.
  const score = (p) =>
    p.id === winnerId || p.seen ? Number(p.maal) || 0 : 0;
  const total = players.reduce((sum, p) => sum + score(p), 0);

  const net = {};
  let winnerNet = 0;
  for (const p of players) {
    if (p.id === winnerId) continue;
    const w =
      (p.seen ? SEEN_PENALTY : UNSEEN_PENALTY) + (dubleeWin ? DUBLEE_BONUS : 0);
    const pays = total + w - n * score(p);
    net[p.id] = -pays;
    winnerNet += pays;
  }
  net[winnerId] = winnerNet;
  return net;
}

/**
 * Turn running totals into the fewest payments that square everyone up.
 * Biggest debtor pays biggest creditor first, until all balances are zero.
 * @param {Record<string, number>} totals net points per player id (sums to 0)
 * @returns {{from: string, to: string, amount: number}[]}
 */
export function whoOwesWhom(totals) {
  const creditors = [];
  const debtors = [];
  for (const [id, n] of Object.entries(totals)) {
    if (n > 0) creditors.push({ id, left: n });
    else if (n < 0) debtors.push({ id, left: -n });
  }
  creditors.sort((a, b) => b.left - a.left);
  debtors.sort((a, b) => b.left - a.left);

  const payments = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].left, debtors[d].left);
    payments.push({ from: debtors[d].id, to: creditors[c].id, amount });
    creditors[c].left -= amount;
    debtors[d].left -= amount;
    if (creditors[c].left === 0) c++;
    if (debtors[d].left === 0) d++;
  }
  return payments;
}
