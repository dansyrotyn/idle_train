import { Game } from './Game.js';

async function boot() {
  // Canvas textures (badges, posters) need the UI font, so wait for it briefly.
  try {
    await Promise.race([document.fonts.load('64px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fall back to system fonts */
  }
  const game = new Game(document.getElementById('game'));
  game.start();
  window.game = game; // handy for poking at state from the console
}

boot();
