import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

export const desktop = isTauri();
export async function resize(expanded: boolean): Promise<void> {
  if (!desktop) return;
  await getCurrentWindow().setSize(new LogicalSize(expanded ? 390 : 180, expanded ? 740 : 190));
}
export async function drag(): Promise<void> {
  if (desktop) await getCurrentWindow().startDragging();
}
export async function quit(): Promise<void> {
  if (desktop) await getCurrentWindow().close();
}
