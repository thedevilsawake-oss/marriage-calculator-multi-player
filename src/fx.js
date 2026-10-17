// Casino effects: sounds, flying chips, confetti, number roll-ups.

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const layer = () => document.getElementById("fx");

let audio;
let muted = false;
export const setMuted = (m) => (muted = m);

function ctx() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

function tone(freq, start, dur, type = "sine", gain = 0.15) {
  const a = ctx();
  if (!a || muted) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sound = {
  tap: () => tone(660, 0, 0.06, "triangle", 0.08),
  chip: () => {
    tone(2200 + Math.random() * 600, 0, 0.05, "square", 0.04);
    tone(3400 + Math.random() * 400, 0.015, 0.06, "sine", 0.05);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, "triangle", 0.14)),
  error: () => tone(160, 0, 0.18, "sawtooth", 0.06),
};

export function buzz(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Fly `count` chips from one element to another. Resolves when all land. */
export function flyChips(fromEl, toEl, count, color) {
  if (reduceMotion || !fromEl || !toEl) return Promise.resolve();
  const a = center(fromEl);
  const b = center(toEl);
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.setProperty("--chip", color);
    chip.style.left = `${a.x - 14}px`;
    chip.style.top = `${a.y - 14}px`;
    layer().append(chip);
    const lift = -60 - Math.random() * 60;
    const jitter = (Math.random() - 0.5) * 30;
    const dx = b.x - a.x + jitter;
    const dy = b.y - a.y + jitter;
    const anim = chip.animate(
      [
        { transform: "translate(0,0) scale(0.6) rotate(0deg)", opacity: 0 },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(1.1) rotate(180deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.8) rotate(360deg)`, opacity: 1 },
      ],
      { duration: 650, delay: i * 70, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" },
    );
    jobs.push(
      anim.finished.then(() => {
        sound.chip();
        chip.remove();
      }),
    );
  }
  return Promise.all(jobs);
}

/** Burst of confetti from an element (or the top of the screen). */
export function confetti(fromEl, pieces = 90) {
  if (reduceMotion) return;
  const origin = fromEl ? center(fromEl) : { x: innerWidth / 2, y: 0 };
  const colors = ["#ffd54a", "#ff4d6d", "#4dd4ff", "#7cff8a", "#ffffff", "#c77dff"];
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    p.style.background = colors[i % colors.length];
    p.style.left = `${origin.x}px`;
    p.style.top = `${origin.y}px`;
    layer().append(p);
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 220;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 160;
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy + 420}px) rotate(${720 * Math.random()}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 900, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" },
    ).finished.then(() => p.remove());
  }
}

/** Animate a number in `el` from `from` to `to`, formatted by `fmt`. */
export function rollNumber(el, from, to, fmt, duration = 900) {
  if (reduceMotion || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let toastTimer;
export function toast(html) {
  const el = document.getElementById("toast");
  el.innerHTML = html;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
