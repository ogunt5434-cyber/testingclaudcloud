// Entry point: loads the game store and mounts the UI.
import './style.css';
import { Game } from './core/game';
import { mountApp, mountFatal } from './ui/app';

/** localStorage may be missing or throw (private mode, sandboxed iframes). */
function safeStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    storage.getItem('');
    return storage;
  } catch {
    return null;
  }
}

/** Emoji favicon as an inline SVG (no asset files, and no /favicon.ico 404). */
function installFavicon(): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚔️</text></svg>`;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  document.head.append(link);
}

function boot(): void {
  installFavicon();
  const root = document.getElementById('app');
  if (!root) return;
  let game: Game;
  try {
    game = Game.load({ storage: safeStorage() });
  } catch (err) {
    mountFatal(root, err);
    return;
  }
  mountApp(root, game);
}

boot();
