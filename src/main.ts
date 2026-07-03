import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PhysicalPosition } from "@tauri-apps/api/dpi";

interface StatePayload {
  state: "idle" | "working" | "waiting" | "error" | "completed";
  message: string;
  timestamp: number;
  activeCount: number;
}

type BeatType = "whip" | "stick" | "car" | "water" | "egg";

// Track whether the pet is currently in hurt (beat) mode
let isHurting = false;
let hurtTimeoutId: number | null = null;
let whipAnimFrame: number | null = null;
// The state to restore to after hurt animation ends
let pendingState: string = "idle";

// Beat rotation queue: whip → stick → car → water → egg → repeat
const beatRotation: BeatType[] = ["whip", "stick", "car", "water", "egg"];
let beatIndex = 0;

function setPetState(state: string) {
  const pet = document.getElementById("pet-sprite");
  if (!pet) return;
  if (isHurting) {
    pendingState = state;
    return;
  }
  pet.className = `pet-sprite state-${state}`;
}

/** Remove all "striking" classes and cancel running whip animation */
function clearAllEffects() {
  if (whipAnimFrame !== null) {
    cancelAnimationFrame(whipAnimFrame);
    whipAnimFrame = null;
  }
  const whipPath = document.getElementById("whip-path");
  const whipFlash = document.getElementById("whip-flash");
  if (whipPath) {
    whipPath.setAttribute("d", "");
    whipPath.setAttribute("opacity", "0");
  }
  if (whipFlash) {
    whipFlash.setAttribute("r", "0");
    whipFlash.setAttribute("opacity", "0");
  }
  document.querySelectorAll(".striking").forEach((el) => {
    el.classList.remove("striking");
  });
}

/** Map beat type to the sprite state name used in CSS */
function beatSpriteState(beatType: BeatType): string {
  // whip uses the "hurt" sprite; others have their own sprite sheets
  return beatType === "whip" ? "hurt" : beatType;
}

/** Enter hurt mode: save pending state (only on first entry), set pet sprite */
function startHurt(beatType: BeatType) {
  const pet = document.getElementById("pet-sprite");
  if (!pet) return;

  // Only save state on first entry — don't overwrite with a hurt state
  if (!isHurting) {
    const match = pet.className.match(/state-(\w+)/);
    pendingState = match ? match[1] : "idle";
  }

  isHurting = true;
  pet.className = `pet-sprite state-${beatSpriteState(beatType)}`;

  if (hurtTimeoutId !== null) {
    clearTimeout(hurtTimeoutId);
    hurtTimeoutId = null;
  }
}

/** Exit hurt mode: clear effects, restore pet state */
function endHurt() {
  isHurting = false;
  hurtTimeoutId = null;
  clearAllEffects();
  const pet = document.getElementById("pet-sprite");
  if (pet) {
    pet.className = `pet-sprite state-${pendingState}`;
  }
}

/**
 * Trigger a CSS-based beat effect (stick / car / water / egg).
 * Shows a weapon animation, then an impact flash after a delay.
 */
function triggerCssBeat(
  beatType: BeatType,
  weaponSelector: string,
  impactSelector: string,
  impactDelay: number,
) {
  startHurt(beatType);
  clearAllEffects();

  const weapon = document.querySelector(weaponSelector) as HTMLElement | null;
  if (weapon) {
    void weapon.offsetWidth; // force reflow to restart animation
    weapon.classList.add("striking");
  }

  const impact = document.querySelector(impactSelector) as HTMLElement | null;
  if (impact) {
    window.setTimeout(() => {
      void impact.offsetWidth;
      impact.classList.add("striking");
    }, impactDelay);
  }

  hurtTimeoutId = window.setTimeout(() => endHurt(), 1800);
}

/**
 * Compute a tapered whip outline (filled polygon) from a quadratic bezier
 * centerline. The whip is thick at the handle (w0) and thin at the tip (w2),
 * producing a realistic leather-whip silhouette.
 */
function computeWhipOutline(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  w0: number,
  w2: number,
  segments: number,
): string {
  const pts: [number, number][] = [];
  const hws: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    pts.push([
      mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x,
      mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y,
    ]);
    hws.push((w0 + (w2 - w0) * t) / 2);
  }

  const left: string[] = [];
  const right: string[] = [];

  for (let i = 0; i < pts.length; i++) {
    let dx: number, dy: number;
    if (i === 0) {
      dx = pts[1][0] - pts[0][0];
      dy = pts[1][1] - pts[0][1];
    } else if (i === pts.length - 1) {
      dx = pts[i][0] - pts[i - 1][0];
      dy = pts[i][1] - pts[i - 1][1];
    } else {
      dx = pts[i + 1][0] - pts[i - 1][0];
      dy = pts[i + 1][1] - pts[i - 1][1];
    }
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }

    const hw = hws[i];
    left.push(`${(pts[i][0] - dy * hw).toFixed(2)} ${(pts[i][1] + dx * hw).toFixed(2)}`);
    right.push(`${(pts[i][0] + dy * hw).toFixed(2)} ${(pts[i][1] - dx * hw).toFixed(2)}`);
  }

  right.reverse();
  return `M ${left.join(" L ")} L ${right.join(" L ")} Z`;
}

/**
 * Animate a flexible whip in four phases:
 * 1. 蓄力慢摆  — whip curls up near handle, slowly swaying
 * 2. 急速甩出  — tip accelerates toward target, path snaps straight
 * 3. 破空闪光  — whip fully taut, bright flash at tip (the "crack")
 * 4. 回弹振荡  — whip recoils with diminishing oscillation, fades out
 */
function triggerWhip() {
  const pet = document.getElementById("pet-sprite");
  const whipPath = document.getElementById("whip-path") as SVGPathElement | null;
  const whipFlash = document.getElementById("whip-flash") as SVGCircleElement | null;
  const whipImpact = document.querySelector(".whip-impact") as HTMLElement | null;

  if (!pet || !whipPath || !whipFlash || !whipImpact) return;

  const _path = whipPath;
  const _flash = whipFlash;
  const _impact = whipImpact;

  startHurt("whip");
  clearAllEffects();

  // Whip geometry
  const hx = 106, hy = 16;   // handle (top-right, fixed)
  const tx = 58, ty = 40;    // target (cat's head area)
  const duration = 600;       // total animation ms
  const startTime = performance.now();
  let impactTriggered = false;

  function animate(now: number) {
    const t = (now - startTime) / duration;

    if (t >= 1) {
      _path.setAttribute("d", "");
      _path.setAttribute("opacity", "0");
      _flash.setAttribute("r", "0");
      _flash.setAttribute("opacity", "0");
      whipAnimFrame = null;
      return;
    }

    let tipX: number, tipY: number, ctrlX: number, ctrlY: number;
    let opacity = 1;
    let flashR = 0;
    let flashOp = 0;

    if (t < 0.35) {
      // ── Phase 1: 蓄力慢摆 ──
      const p = t / 0.35;
      const sway = Math.sin(p * Math.PI * 2.5) * 3;
      tipX = hx - 8 + sway;
      tipY = hy + 16 + p * 4;
      ctrlX = hx + 12 + sway * 0.4;
      ctrlY = hy + 26;
      opacity = Math.min(1, p * 1.8);
    } else if (t < 0.50) {
      // ── Phase 2: 急速甩出绷直 ──
      const p = (t - 0.35) / 0.15;
      const ease = p * p;
      const sX = hx - 8;
      const sY = hy + 20;
      tipX = sX + (tx - sX) * ease;
      tipY = sY + (ty - sY) * ease;
      ctrlX = hx + 12 + ((hx + tx) / 2 - (hx + 12)) * ease;
      ctrlY = hy + 26 + ((hy + ty) / 2 - (hy + 26)) * ease;
    } else if (t < 0.58) {
      // ── Phase 3: 破空闪光 ──
      const p = (t - 0.50) / 0.08;
      tipX = tx;
      tipY = ty;
      ctrlX = (hx + tx) / 2;
      ctrlY = (hy + ty) / 2;
      flashR = 6 + p * 20;
      flashOp = (1 - p) * 0.95;
    } else {
      // ── Phase 4: 回弹振荡 ──
      const p = (t - 0.58) / 0.42;
      const ease = 1 - Math.pow(1 - p, 2.5);
      const osc = Math.sin(p * Math.PI * 4) * 4 * (1 - p);
      tipX = tx + (hx - 6 - tx) * ease + osc;
      tipY = ty + (hy + 8 - ty) * ease;
      ctrlX = hx + 6 + osc * 1.5;
      ctrlY = hy + 22 - 4 * ease;
      opacity = 1 - ease * 0.85;
    }

    // Trigger SMACK! impact at the crack moment
    if (!impactTriggered && t >= 0.48) {
      impactTriggered = true;
      void _impact.offsetWidth;
      _impact.classList.add("striking");
    }

    // Render tapered whip outline
    const d = computeWhipOutline(hx, hy, ctrlX, ctrlY, tipX, tipY, 5, 1, 18);
    _path.setAttribute("d", d);
    _path.setAttribute("opacity", String(opacity));

    // Render crack flash
    _flash.setAttribute("cx", String(tipX));
    _flash.setAttribute("cy", String(tipY));
    _flash.setAttribute("r", String(flashR));
    _flash.setAttribute("opacity", String(flashOp));

    whipAnimFrame = requestAnimationFrame(animate);
  }

  whipAnimFrame = requestAnimationFrame(animate);

  hurtTimeoutId = window.setTimeout(() => endHurt(), 1800);
}

/**
 * Master beat trigger: picks the next effect in rotation.
 * whip → stick → car → water → egg → whip → ...
 */
function triggerBeat() {
  const beatType = beatRotation[beatIndex % beatRotation.length];
  beatIndex++;

  switch (beatType) {
    case "whip":
      triggerWhip();
      break;
    case "stick":
      triggerCssBeat("stick", ".stick-weapon", ".stick-impact", 240);
      break;
    case "car":
      triggerCssBeat("car", ".car-vehicle", ".car-impact", 320);
      break;
    case "water":
      triggerCssBeat("water", ".water-stream", ".water-impact", 200);
      break;
    case "egg":
      triggerCssBeat("egg", ".egg-projectile", ".egg-impact", 300);
      break;
  }
}

async function initDrag() {
  const appWindow = getCurrentWindow();
  let dragging = false;
  let startMouseX = 0;
  let startMouseY = 0;
  let startWinX = 0;
  let startWinY = 0;

  document.addEventListener("mousedown", async (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    startMouseX = e.screenX;
    startMouseY = e.screenY;
    try {
      const pos = await appWindow.outerPosition();
      startWinX = pos.x;
      startWinY = pos.y;
    } catch {
      dragging = false;
    }
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.screenX - startMouseX;
    const dy = e.screenY - startMouseY;
    appWindow.setPosition({ type: "Physical", x: startWinX + dx, y: startWinY + dy } as PhysicalPosition);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });
}

async function init() {
  const currentState = await invoke<StatePayload>("get_current_state");
  setPetState(currentState.state);

  await listen<StatePayload>("state-changed", (event) => {
    setPetState(event.payload.state);
  });

  await listen("whip", () => {
    triggerBeat();
  });

  await initDrag();
}

window.addEventListener("DOMContentLoaded", init);
