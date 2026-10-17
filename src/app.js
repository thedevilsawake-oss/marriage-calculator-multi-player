import { settleHand } from "./scoring.js";

const STORAGE_KEY = "marriage-calculator:v1";
const $ = (sel) => document.querySelector(sel);

// state = { players: [{id, name}], hands: [{id, at, winnerId, dubleeWin, entries, net}] }
let state = load();
let draftNames = ["", "", "", ""];

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.players)) return saved;
  } catch {}
  return { players: [], hands: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const uid = () => Math.random().toString(36).slice(2, 10);
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const tone = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---------- Setup ----------

function renderSetup() {
  const list = $("#setup-players");
  list.replaceChildren(
    ...draftNames.map((name, i) => {
      const input = el("input", {
        type: "text",
        value: name,
        placeholder: `Player ${i + 1}`,
        oninput: (e) => (draftNames[i] = e.target.value),
      });
      const remove = el("button", {
        className: "ghost icon",
        textContent: "✕",
        title: "Remove player",
        disabled: draftNames.length <= 2,
        onclick: () => {
          draftNames.splice(i, 1);
          renderSetup();
        },
      });
      return el("li", {}, input, remove);
    }),
  );
}

$("#add-player").onclick = () => {
  draftNames.push("");
  renderSetup();
  $("#setup-players li:last-child input").focus();
};

$("#start-game").onclick = () => {
  const names = draftNames.map((n, i) => n.trim() || `Player ${i + 1}`);
  const error = $("#setup-error");
  if (names.length < 2) {
    error.textContent = "You need at least 2 players.";
    error.hidden = false;
    return;
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    error.textContent = "Player names must be different.";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  state = { players: names.map((name) => ({ id: uid(), name })), hands: [] };
  resetHandDraft();
  save();
  render();
};

$("#new-game").onclick = () => {
  if (state.hands.length && !confirm("Start a new game? The current scores and history will be cleared.")) {
    return;
  }
  draftNames = state.players.map((p) => p.name);
  state = { players: [], hands: [] };
  save();
  render();
};

// ---------- Hand entry ----------

// Draft of the hand currently being entered.
let hand;
function resetHandDraft() {
  hand = {
    winnerId: null,
    dubleeWin: false,
    entries: Object.fromEntries(state.players.map((p) => [p.id, { seen: false, maal: "" }])),
  };
}

function handInput() {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      seen: p.id === hand.winnerId || hand.entries[p.id].seen,
      maal: Number(hand.entries[p.id].maal) || 0,
    })),
    winnerId: hand.winnerId,
    dubleeWin: hand.dubleeWin,
  };
}

function renderHandEntry() {
  $("#hand-number").textContent = `#${state.hands.length + 1}`;
  const preview = hand.winnerId ? settleHand(handInput()) : null;

  $("#hand-entry tbody").replaceChildren(
    ...state.players.map((p) => {
      const entry = hand.entries[p.id];
      const isWinner = p.id === hand.winnerId;
      const seen = isWinner || entry.seen;

      const won = el("input", {
        type: "radio",
        name: "winner",
        checked: isWinner,
        onchange: () => {
          hand.winnerId = p.id;
          renderHandEntry();
        },
      });
      const seenBox = el("input", {
        type: "checkbox",
        checked: seen,
        disabled: isWinner,
        onchange: (e) => {
          entry.seen = e.target.checked;
          renderHandEntry();
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
        oninput: (e) => {
          entry.maal = e.target.value;
          updatePreview();
        },
      });
      const net = preview ? preview[p.id] : null;
      const netCell = el("td", {
        className: `net ${net == null ? "" : tone(net)}`,
        textContent: net == null ? "" : signed(net),
      });
      netCell.dataset.player = p.id;

      return el(
        "tr",
        { className: isWinner ? "winner" : "" },
        el("td", { textContent: p.name }),
        el("td", { className: "center" }, won),
        el("td", { className: "center" }, seenBox),
        el("td", {}, maal),
        netCell,
      );
    }),
  );
  $("#dublee-win").checked = hand.dubleeWin;
}

// Refresh only the Net column so typing into a maal box keeps focus.
function updatePreview() {
  if (!hand.winnerId) return;
  const preview = settleHand(handInput());
  for (const cell of document.querySelectorAll("#hand-entry td.net")) {
    const n = preview[cell.dataset.player];
    cell.textContent = signed(n);
    cell.className = `net ${tone(n)}`;
  }
}

$("#dublee-win").onchange = (e) => {
  hand.dubleeWin = e.target.checked;
  updatePreview();
};

$("#save-hand").onclick = () => {
  const error = $("#hand-error");
  if (!hand.winnerId) {
    error.textContent = "Pick who won the hand.";
    error.hidden = false;
    return;
  }
  const input = handInput();
  if (input.players.some((p) => p.maal < 0 || !Number.isInteger(p.maal))) {
    error.textContent = "Maal must be a whole number of 0 or more.";
    error.hidden = false;
    return;
  }
  error.hidden = true;
  state.hands.push({
    id: uid(),
    at: Date.now(),
    winnerId: input.winnerId,
    dubleeWin: input.dubleeWin,
    entries: input.players,
    net: settleHand(input),
  });
  save();
  resetHandDraft();
  render();
};

// ---------- Totals & history ----------

function totals() {
  const sum = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  for (const h of state.hands) {
    for (const [id, n] of Object.entries(h.net)) sum[id] += n;
  }
  return sum;
}

function renderTotals() {
  const sum = totals();
  const ranked = [...state.players].sort((a, b) => sum[b.id] - sum[a.id]);
  $("#totals").replaceChildren(
    ...ranked.map((p) =>
      el(
        "tr",
        {},
        el("td", { textContent: p.name }),
        el("td", { className: `num ${tone(sum[p.id])}`, textContent: signed(sum[p.id]) }),
      ),
    ),
  );
}

function renderHistory() {
  const table = $("#history");
  $("#no-history").hidden = state.hands.length > 0;
  if (!state.hands.length) {
    table.replaceChildren();
    return;
  }
  const head = el(
    "tr",
    {},
    el("th", { textContent: "#" }),
    ...state.players.map((p) => el("th", { className: "num", textContent: p.name })),
    el("th"),
  );
  const rows = state.hands
    .map((h, i) =>
      el(
        "tr",
        {},
        el("td", { textContent: `${i + 1}${h.dubleeWin ? " D" : ""}`, title: h.dubleeWin ? "8 dublees" : "" }),
        ...state.players.map((p) => {
          const entry = h.entries.find((e) => e.id === p.id);
          const cell = el("td", {
            className: `num ${tone(h.net[p.id])}`,
            textContent: signed(h.net[p.id]),
            title: entry.seen ? `Maal ${entry.maal}` : "Did not see the joker",
          });
          if (p.id === h.winnerId) cell.prepend(el("span", { className: "crown", textContent: "★ " }));
          if (!entry.seen) cell.append(el("span", { className: "unseen", textContent: " ·u" }));
          return cell;
        }),
        el(
          "td",
          {},
          el("button", {
            className: "ghost icon",
            textContent: "✕",
            title: "Delete this hand",
            onclick: () => {
              if (!confirm(`Delete hand ${i + 1}?`)) return;
              state.hands = state.hands.filter((x) => x.id !== h.id);
              save();
              render();
            },
          }),
        ),
      ),
    )
    .reverse();
  table.replaceChildren(el("thead", {}, head), el("tbody", {}, ...rows));
}

// ---------- Top level ----------

function render() {
  const inGame = state.players.length > 0;
  $("#setup").hidden = inGame;
  $("#game").hidden = !inGame;
  $("#new-game").hidden = !inGame;
  if (!inGame) return renderSetup();
  if (!hand) resetHandDraft();
  renderTotals();
  renderHandEntry();
  renderHistory();
}

render();
