import { settleHand, whoOwesWhom } from "./scoring.js?v=5";
import { sound, buzz, flyChips, confetti, rollNumber, toast, setMuted } from "./fx.js?v=5";

const STORAGE_KEY = "marriage-calculator:v1";
const PREFS_KEY = "marriage-calculator:prefs";
const AVATARS = ["🦁", "🐯", "🦊", "🐼", "🐸", "🐵", "🦄", "🐲", "🦅", "🐺", "🐙", "🤠", "😎", "👑", "🎩", "💎"];
const COLORS = ["#ff4d6d", "#4dd4ff", "#ffd54a", "#7cff8a", "#c77dff", "#ff9f43", "#ff7eb6", "#5ce1e6"];
const $ = (sel) => document.querySelector(sel);

// state = { players: [{id, name, avatar, color}], hands: [{id, at, winnerId, dubleeWin, entries, net}] }
let state = load();
let draft = defaultDraft(4);
let busy = false;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.players)) {
      // Older saves have no avatar/colour.
      saved.players.forEach((p, i) => {
        p.avatar ??= AVATARS[i % AVATARS.length];
        p.color ??= COLORS[i % COLORS.length];
      });
      return saved;
    }
  } catch {}
  return { players: [], hands: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
})();
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

const uid = () => Math.random().toString(36).slice(2, 10);
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const tone = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

// ---------- Sound toggle ----------

function renderSound() {
  setMuted(!!prefs.muted);
  $("#sound").textContent = prefs.muted ? "🔇" : "🔊";
  $("#sound").setAttribute("aria-pressed", String(!prefs.muted));
}
$("#sound").onclick = () => {
  prefs.muted = !prefs.muted;
  savePrefs();
  renderSound();
  sound.tap();
};

// ---------- Setup ----------

function defaultDraft(n) {
  return Array.from({ length: n }, (_, i) => ({
    name: "",
    avatar: AVATARS[i % AVATARS.length],
    color: COLORS[i % COLORS.length],
  }));
}

function renderSetup() {
  $("#setup-players").replaceChildren(
    ...draft.map((d, i) => {
      const avatar = el("button", {
        className: "avatar big",
        textContent: d.avatar,
        title: "Change avatar",
        onclick: () => {
          // Cycle to the next avatar nobody else at the table is using.
          const taken = new Set(draft.filter((o) => o !== d).map((o) => o.avatar));
          let i = AVATARS.indexOf(d.avatar);
          do i = (i + 1) % AVATARS.length;
          while (taken.has(AVATARS[i]));
          d.avatar = AVATARS[i];
          sound.tap();
          buzz();
          renderSetup();
        },
      });
      avatar.style.setProperty("--ring", d.color);
      const input = el("input", {
        type: "text",
        value: d.name,
        placeholder: `Player ${i + 1}`,
        maxLength: 16,
        oninput: (e) => (d.name = e.target.value),
      });
      const remove = el("button", {
        className: "pill icon",
        textContent: "✕",
        title: "Remove player",
        disabled: draft.length <= 2,
        onclick: () => {
          draft.splice(i, 1);
          renderSetup();
        },
      });
      return el("li", {}, avatar, input, remove);
    }),
  );
  $("#add-player").disabled = draft.length >= 8;
}

$("#add-player").onclick = () => {
  const i = draft.length;
  const used = new Set(draft.map((d) => d.avatar));
  draft.push({
    name: "",
    avatar: AVATARS.find((a) => !used.has(a)) ?? AVATARS[i % AVATARS.length],
    color: COLORS[i % COLORS.length],
  });
  sound.tap();
  renderSetup();
  $("#setup-players li:last-child input").focus();
};

$("#start-game").onclick = () => {
  const names = draft.map((d, i) => d.name.trim() || `Player ${i + 1}`);
  const error = $("#setup-error");
  const fail = (msg) => {
    error.textContent = msg;
    error.hidden = false;
    sound.error();
  };
  if (names.length < 2) return fail("You need at least 2 players.");
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return fail("Player names must be different.");
  }
  error.hidden = true;
  state = {
    players: draft.map((d, i) => ({ id: uid(), name: names[i], avatar: d.avatar, color: d.color })),
    hands: [],
  };
  resetHand();
  save();
  sound.win();
  render();
  confetti(null, 60);
};

$("#new-game").onclick = () => {
  if (state.hands.length && !confirm("Start a new table? The current scores and history will be cleared.")) return;
  draft = state.players.map(({ name, avatar, color }) => ({ name, avatar, color }));
  state = { players: [], hands: [] };
  save();
  render();
};

// ---------- Hand being entered ----------

let hand;
function resetHand() {
  hand = {
    winnerId: null,
    dubleeWin: false,
    entries: Object.fromEntries(state.players.map((p) => [p.id, { seen: false, maal: "" }])),
  };
}

const isSeen = (id) => id === hand.winnerId || hand.entries[id].seen;

function handInput() {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      seen: isSeen(p.id),
      maal: Number(hand.entries[p.id].maal) || 0,
    })),
    winnerId: hand.winnerId,
    dubleeWin: hand.dubleeWin,
  };
}

// ---------- Totals & stats ----------

function totals(hands = state.hands) {
  const sum = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  for (const h of hands) for (const [id, n] of Object.entries(h.net)) sum[id] += n;
  return sum;
}

function streakOf(id) {
  let n = 0;
  for (let i = state.hands.length - 1; i >= 0 && state.hands[i].winnerId === id; i--) n++;
  return n;
}

function ranks(sum) {
  const sorted = [...state.players].sort((a, b) => sum[b.id] - sum[a.id]);
  return Object.fromEntries(sorted.map((p, i) => [p.id, i]));
}

const MEDALS = ["🥇", "🥈", "🥉"];

// ---------- The table ----------

function seat(p, sum, rank) {
  const entry = hand.entries[p.id];
  const isWinner = p.id === hand.winnerId;
  const seen = isSeen(p.id);
  const streak = streakOf(p.id);

  const avatar = el("div", { className: "avatar", textContent: p.avatar });
  avatar.style.setProperty("--ring", p.color);

  const balance = el("span", { className: `balance ${tone(sum[p.id])}`, textContent: signed(sum[p.id]) });
  balance.dataset.balance = p.id;

  const crown = el("button", {
    className: `toggle crown ${isWinner ? "on" : ""}`,
    innerHTML: "👑<span>Won</span>",
    title: "Ended the game",
    ariaPressed: String(isWinner),
    onclick: () => {
      hand.winnerId = isWinner ? null : p.id;
      sound.tap();
      buzz();
      renderTable();
    },
  });
  const eye = el("button", {
    className: `toggle eye ${seen ? "on" : ""}`,
    innerHTML: `${seen ? "👁" : "🙈"}<span>${seen ? "Seen" : "Unseen"}</span>`,
    ariaPressed: String(seen),
    disabled: isWinner,
    title: isWinner ? "The winner always has seen the joker" : "Did this player see the joker?",
    onclick: () => {
      entry.seen = !entry.seen;
      sound.tap();
      buzz();
      renderTable();
    },
  });

  const maal = el("input", {
    type: "number",
    inputMode: "numeric",
    min: "0",
    step: "1",
    value: seen ? entry.maal : "",
    placeholder: seen ? "0" : "—",
    disabled: !seen,
    ariaLabel: `${p.name} maal`,
    oninput: (e) => {
      entry.maal = e.target.value;
      updatePreview();
    },
  });
  const step = (d) =>
    el("button", {
      className: "step",
      textContent: d > 0 ? "+" : "−",
      disabled: !seen,
      ariaLabel: `${d > 0 ? "Add" : "Remove"} one maal`,
      onclick: () => {
        entry.maal = String(Math.max(0, (Number(entry.maal) || 0) + d));
        maal.value = entry.maal;
        sound.tap();
        buzz(5);
        updatePreview();
      },
    });

  const net = el("div", { className: "net-bubble" });
  net.dataset.net = p.id;

  const badges = el(
    "div",
    { className: "badges" },
    rank < 3 && state.hands.length ? el("span", { textContent: MEDALS[rank] }) : null,
    streak >= 2 ? el("span", { className: "streak", textContent: `🔥${streak}` }) : null,
  );

  const node = el(
    "div",
    { className: `seat ${isWinner ? "winner" : ""} ${seen ? "" : "unseen"}` },
    badges,
    el("div", { className: "seat-head" }, avatar, el("div", { className: "who" }, el("b", { textContent: p.name }), el("span", { className: "stack" }, el("i", { className: "mini-chip" }), balance))),
    el("div", { className: "toggles" }, crown, eye),
    el("label", { className: "maal" }, el("span", { className: "maal-row" }, "Maal", net), el("div", { className: "stepper" }, step(-1), maal, step(1))),
  );
  node.dataset.seat = p.id;
  node.style.setProperty("--ring", p.color);
  return node;
}

function pot() {
  const winner = state.players.find((p) => p.id === hand.winnerId);
  const dublee = el("button", {
    className: `toggle dublee ${hand.dubleeWin ? "on" : ""}`,
    innerHTML: "🃏<span>8 dublees</span>",
    ariaPressed: String(hand.dubleeWin),
    title: "Winner ended with 8 dublees: +5 from each opponent",
    onclick: () => {
      hand.dubleeWin = !hand.dubleeWin;
      sound.tap();
      buzz();
      renderTable();
    },
  });
  const settle = el("button", {
    className: "gold-btn",
    id: "settle",
    textContent: winner ? `Settle · ${winner.name} wins` : "Pick a winner 👑",
    disabled: !winner,
    onclick: settleUp,
  });
  return el(
    "div",
    { className: "pot" },
    el("div", { className: "pot-title" }, el("span", { className: "label", textContent: "Hand" }), el("span", { className: "hand-no", textContent: `#${state.hands.length + 1}` })),
    el("div", { className: "pot-total" }, el("span", { className: "label", textContent: "Maal on table" }), el("span", { id: "pot-total", textContent: "0" })),
    dublee,
    settle,
  );
}

function renderTable(rollFrom) {
  const sum = totals();
  const rank = ranks(sum);
  const seats = state.players.map((p) => seat(p, sum, rank[p.id]));
  // Put the pot in the middle of the table, between the two halves of the seats.
  const half = Math.ceil(seats.length / 2);
  $("#table").style.setProperty("--cols", Math.min(half, 4));
  $("#table").replaceChildren(...seats.slice(0, half), pot(), ...seats.slice(half));
  $("#table").classList.toggle("has-winner", !!hand.winnerId);
  if (rollFrom) {
    for (const p of state.players) {
      rollNumber($(`[data-balance="${p.id}"]`), rollFrom[p.id], sum[p.id], signed);
    }
  }
  updatePreview();
}

// Refresh the net bubbles and pot without rebuilding the seats, so typing keeps focus.
function updatePreview() {
  const input = handInput();
  $("#pot-total").textContent = input.players.reduce((s, p) => s + (p.seen ? p.maal : 0), 0);
  const preview = hand.winnerId ? settleHand(input) : null;
  for (const bubble of document.querySelectorAll("[data-net]")) {
    const n = preview?.[bubble.dataset.net];
    bubble.textContent = n == null ? "" : signed(n);
    bubble.className = `net-bubble ${n == null ? "" : `show ${tone(n)}`}`;
  }
}

// ---------- Settling a hand ----------

async function settleUp() {
  if (busy) return;
  const error = $("#hand-error");
  const input = handInput();
  if (input.players.some((p) => p.maal < 0 || !Number.isInteger(p.maal))) {
    error.textContent = "Maal must be a whole number of 0 or more.";
    error.hidden = false;
    sound.error();
    return;
  }
  error.hidden = true;
  busy = true;
  $("#settle").disabled = true;

  const before = totals();
  const net = settleHand(input);
  const winner = state.players.find((p) => p.id === input.winnerId);
  const seatOf = (id) => $(`[data-seat="${id}"]`);

  // Chips fly from each payer to the winner (or from the winner to anyone the winner owes).
  const flights = state.players
    .filter((p) => p.id !== winner.id && net[p.id] !== 0)
    .map((p, i) => {
      const amount = Math.abs(net[p.id]);
      const count = Math.min(8, Math.max(2, Math.ceil(amount / 5)));
      const [from, to] = net[p.id] < 0 ? [p, winner] : [winner, p];
      return new Promise((r) => setTimeout(r, i * 180)).then(() =>
        flyChips(seatOf(from.id), seatOf(to.id), count, from.color),
      );
    });
  await Promise.all(flights);

  state.hands.push({
    id: uid(),
    at: Date.now(),
    winnerId: input.winnerId,
    dubleeWin: input.dubleeWin,
    entries: input.players,
    net,
  });
  save();
  resetHand();
  render(before);

  const winnerSeat = seatOf(winner.id);
  winnerSeat?.classList.add("celebrate");
  confetti(winnerSeat);
  sound.win();
  buzz([20, 40, 20]);
  const gain = net[winner.id];
  toast(`${winner.avatar} <b>${escapeHtml(winner.name)}</b> ${gain >= 0 ? "collects" : "pays out"} <b class="${tone(gain)}">${signed(gain)}</b>${input.dubleeWin ? " · 8 dublees!" : ""}`);
  busy = false;
}

// ---------- Leaderboard & log ----------

function renderStandings(rollFrom) {
  const sum = totals();
  const values = Object.values(sum).map(Math.abs);
  const max = Math.max(1, ...values);
  const sorted = [...state.players].sort((a, b) => sum[b.id] - sum[a.id]);
  $("#standings").replaceChildren(
    ...sorted.map((p, i) => {
      const value = el("span", { className: `num ${tone(sum[p.id])}`, textContent: signed(sum[p.id]) });
      if (rollFrom) rollNumber(value, rollFrom[p.id], sum[p.id], signed);
      const bar = el("div", { className: `bar ${sum[p.id] < 0 ? "neg" : ""}` });
      bar.style.setProperty("--w", `${(Math.abs(sum[p.id]) / max) * 100}%`);
      bar.style.setProperty("--c", p.color);
      const wins = state.hands.filter((h) => h.winnerId === p.id).length;
      return el(
        "li",
        {},
        el("span", { className: "rank", textContent: state.hands.length && i < 3 ? MEDALS[i] : `${i + 1}` }),
        el("span", { className: "avatar small", textContent: p.avatar }),
        el("div", { className: "who" }, el("b", { textContent: p.name }), el("span", { className: "sub", textContent: `${wins} win${wins === 1 ? "" : "s"}` }), bar),
        value,
      );
    }),
  );
}

function renderHistory() {
  $("#no-history").hidden = state.hands.length > 0;
  $("#undo").hidden = state.hands.length === 0;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const items = state.hands.map((h, i) => {
    const winner = byId[h.winnerId];
    const chips = state.players.map((p) => {
      const entry = h.entries.find((e) => e.id === p.id);
      return el(
        "span",
        {
          className: `delta ${tone(h.net[p.id])} ${p.id === h.winnerId ? "won" : ""}`,
          title: entry.seen ? `${p.name}: maal ${entry.maal}` : `${p.name}: did not see the joker`,
        },
        `${p.avatar} ${signed(h.net[p.id])}`,
        entry.seen ? null : el("small", { textContent: " 🙈" }),
      );
    });
    return el(
      "li",
      {},
      el(
        "div",
        { className: "log-head" },
        el("span", { className: "hand-no", textContent: `#${i + 1}` }),
        el("span", { textContent: `👑 ${winner.name}${h.dubleeWin ? " · 🃏 dublees" : ""}` }),
        el("button", {
          className: "pill icon",
          textContent: "✕",
          title: "Delete this hand",
          onclick: () => {
            if (!confirm(`Delete hand ${i + 1}?`)) return;
            const before = totals();
            state.hands = state.hands.filter((x) => x.id !== h.id);
            save();
            render(before);
          },
        }),
      ),
      el("div", { className: "deltas" }, ...chips),
    );
  });
  $("#history").replaceChildren(...items.reverse());
}

// ---------- Cash out: who owes what ----------

// "Rs 1", "$0.10", "2 NPR" -> { prefix, value, suffix }; null if there's no number.
function parseRate(text) {
  const m = text.trim().match(/^(\D*?)\s*(\d+(?:\.\d+)?)\s*(\D*)$/);
  if (!m || !Number(m[2])) return null;
  return { prefix: m[1].trim(), value: Number(m[2]), suffix: m[3].trim() };
}

function money(points, rate) {
  const amount = (points * rate.value).toFixed(2).replace(/\.00$/, "");
  const space = rate.prefix.length > 1 ? " " : "";
  return `${rate.prefix}${space}${amount}${rate.suffix ? ` ${rate.suffix}` : ""}`;
}

function cashOutText(payments, rate) {
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const lines = payments.map(
    ({ from, to, amount }) =>
      `${byId[from].name} pays ${byId[to].name} ${amount} pts${rate ? ` (${money(amount, rate)})` : ""}`,
  );
  const hands = `${state.hands.length} hand${state.hands.length === 1 ? "" : "s"}`;
  return [`♥ Marriage cash out (${hands})`, ...(lines.length ? lines : ["Everyone is even!"])].join("\n");
}

function renderCashOut(animate) {
  const payments = whoOwesWhom(totals());
  const rate = parseRate(prefs.rate || "");
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  $("#cashout-sub").textContent = payments.length
    ? `${payments.length} payment${payments.length === 1 ? " squares" : "s square"} everyone up after ${state.hands.length} hand${state.hands.length === 1 ? "" : "s"}.`
    : state.hands.length
      ? "Everyone is even. Nobody owes anything."
      : "No hands played yet. Settle a hand and the payments show up here.";
  $("#payments").replaceChildren(
    ...payments.map(({ from, to, amount }, i) => {
      const who = (p, cls) => {
        const avatar = el("span", { className: "avatar small", textContent: p.avatar });
        avatar.style.setProperty("--ring", p.color);
        return el("span", { className: `party ${cls}` }, avatar, el("b", { textContent: p.name }));
      };
      const row = el(
        "li",
        {},
        who(byId[from], "from"),
        el("span", { className: "arrow" }, el("span", { className: "pts", textContent: `${amount}` }), el("span", { className: "line" })),
        who(byId[to], "to"),
        rate ? el("span", { className: "cash", textContent: money(amount, rate) }) : null,
      );
      if (animate) {
        row.style.animationDelay = `${i * 140}ms`;
        setTimeout(sound.chip, 150 + i * 140);
      }
      return row;
    }),
  );
}

$("#cash-out").onclick = () => {
  $("#rate").value = prefs.rate || "";
  $("#share").textContent = navigator.share ? "📤 Share with the group" : "📋 Copy for group chat";
  renderCashOut(true);
  $("#cashout").showModal();
  sound.tap();
};

$("#cashout-close").onclick = () => $("#cashout").close();
// Close when tapping the dimmed backdrop.
$("#cashout").onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
};

$("#rate").oninput = (e) => {
  prefs.rate = e.target.value;
  savePrefs();
  renderCashOut(false);
};

$("#share").onclick = async () => {
  const text = cashOutText(whoOwesWhom(totals()), parseRate(prefs.rate || ""));
  const button = $("#share");
  const label = button.textContent;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    button.textContent = "✅ Copied!";
  } catch (err) {
    if (err?.name === "AbortError") return;
    button.textContent = "Couldn't copy";
  }
  sound.tap();
  setTimeout(() => (button.textContent = label), 1800);
};

$("#undo").onclick = () => {
  if (!state.hands.length || !confirm(`Undo hand ${state.hands.length}?`)) return;
  const before = totals();
  state.hands.pop();
  save();
  render(before);
  toast("↶ Last hand undone");
};

// ---------- Top level ----------

function render(rollFrom) {
  const inGame = state.players.length > 0;
  $("#setup").hidden = inGame;
  $("#game").hidden = !inGame;
  $("#new-game").hidden = !inGame;
  $("#cash-out").hidden = !inGame;
  if (!inGame) return renderSetup();
  if (!hand) resetHand();
  renderTable(rollFrom);
  renderStandings(rollFrom);
  renderHistory();
}

renderSound();
render();
