// Fabrique data/budget.json à partir du contenu du tableau de bord.
// Usage : node tools/build.mjs contenu.html contenu.js "14 oct. 2026" [code]
// Avec un code, le contenu est chiffré (AES-GCM, clé PBKDF2-SHA256) : seul ce code l'ouvre.
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [html, js, updated, code] = process.argv.slice(2);
const content = { html: readFileSync(html, 'utf8'), js: readFileSync(js, 'utf8'), updated };
const out = new URL('../data/budget.json', import.meta.url);
const b64 = u => Buffer.from(u).toString('base64');

if (!code) {
  writeFileSync(out, JSON.stringify(content));
} else {
  const iter = 600000, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(content)));
  writeFileSync(out, JSON.stringify({ enc: { iter, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) } }));
}
console.log('data/budget.json écrit', code ? '(chiffré)' : '(en clair)');
