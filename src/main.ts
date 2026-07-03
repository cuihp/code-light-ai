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

// Track whether the pet is currently in hurt (whip) mode
let isHurting = false;
let hurtTimeoutId: number | null = null;
// The state to restore to after hurt animation ends
let pendingState: string = "idle";

function setPetState(state: string) {
  const pet = document.getElementById("pet-sprite");
  if (!pet) return;
  if (isHurting) {
    // While hurting, save incoming state to restore later
    pendingState = state;
    return;
  }
  pet.className = `pet-sprite state-${state}`;
}

function triggerWhip() {
  const pet = document.getElementById("pet-sprite");
  const whipStrand = document.querySelector(".whip-strand") as HTMLElement | null;
  const whipImpact = document.querySelector(".whip-impact") as HTMLElement | null;

  if (!pet || !whipStrand || !whipImpact) return;

  // Only save state if we're not already hurting — otherwise keep the
  // original pendingState so we don't restore back to "hurt" forever
  if (!isHurting) {
    const currentClass = pet.className;
    const match = currentClass.match(/state-(\w+)/);
    pendingState = match ? match[1] : "idle";
  }

  // Start hurt mode
  isHurting = true;
  pet.className = "pet-sprite state-hurt";

  // Play whip animation (restart by reflow trick)
  whipStrand.classList.remove("striking");
  whipImpact.classList.remove("striking");
  void whipStrand.offsetWidth;
  void whipImpact.offsetWidth;
  whipStrand.classList.add("striking");
  whipImpact.classList.add("striking");

  // Clear any existing timeout
  if (hurtTimeoutId !== null) {
    clearTimeout(hurtTimeoutId);
  }

  // After 1.8s, restore previous state
  hurtTimeoutId = window.setTimeout(() => {
    isHurting = false;
    hurtTimeoutId = null;
    whipStrand.classList.remove("striking");
    whipImpact.classList.remove("striking");
    pet.className = `pet-sprite state-${pendingState}`;
  }, 1800);
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
    triggerWhip();
  });

  await initDrag();
}

window.addEventListener("DOMContentLoaded", init);
