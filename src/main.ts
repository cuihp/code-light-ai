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

function setPetState(state: string) {
  const pet = document.getElementById("pet-sprite");
  if (!pet) return;
  pet.className = `pet-sprite state-${state}`;
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

  await initDrag();
}

window.addEventListener("DOMContentLoaded", init);
