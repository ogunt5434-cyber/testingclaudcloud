// Packs the production build (dist/) into one standalone HTML file that opens by double-click (file://),
// since browsers refuse to load module scripts from separate files on file:// pages.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const read = (href) => readFileSync(`dist/${href.replace(/^\.\//, '')}`, 'utf8');

const out = html
  .replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>\n${read(href)}\n</style>`)
  .replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
    const js = read(src);
    if (/<\/script/i.test(js)) throw new Error(`${src} contains "</script" and cannot be inlined`);
    return `<script type="module">\n${js}\n</script>`;
  });

if (/(src|href)="\.\/assets\//.test(out)) throw new Error('Some assets were not inlined');

mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/diyar-kahramanlari.html', out);
console.log(`dist-single/diyar-kahramanlari.html (${Math.round(out.length / 1024)} KB)`);
