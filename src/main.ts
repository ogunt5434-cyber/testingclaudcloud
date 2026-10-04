// Entry point: loads the game store and mounts the UI on the 1280x720 stage.
import './style.css';
import { icon } from './art';
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

/** Favicon from the art icon set as an inline SVG (no asset files, and no /favicon.ico 404). */
function installFavicon(): void {
  try {
    const svg = icon('swords', 64);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = `data:image/svg+xml,${encodeURIComponent(svg.outerHTML)}`;
    document.head.append(link);
  } catch {
    // no favicon
  }
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
