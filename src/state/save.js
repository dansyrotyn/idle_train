const KEY = 'idle-train-save-v1';

let disabled = false;

export function loadGame(state) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    return state.fromJSON(JSON.parse(raw));
  } catch (err) {
    console.warn('Save could not be loaded, starting fresh.', err);
    return false;
  }
}

export function saveGame(state) {
  if (disabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state.toJSON()));
  } catch {
    // Storage full or blocked (private mode): the game keeps running without saves.
  }
}

// Wipes the save and blocks further writes, so the unload handler cannot restore it.
export function clearSave() {
  disabled = true;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
