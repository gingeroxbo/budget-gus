// Fabrique le fichier chiffré d'un compte : data/users/<empreinte de l'identifiant>.json
// Usage : node tools/build.mjs <identifiant> <mot de passe> contenu.html contenu.js "14 oct. 2026"
// Seul ce mot de passe ouvre ce fichier (AES-GCM, clé PBKDF2-SHA256). Le même identifiant écrase son ancien fichier.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [id, code, html, js, updated] = process.argv.slice(2);
if (!id || !code || !html || !js) { console.error('Usage : node tools/build.mjs <identifiant> <mot de passe> contenu.html contenu.js "<date>"'); process.exit(1); }
const content = { html: readFileSync(html, 'utf8'), js: readFileSync(js, 'utf8'), updated };
const b64 = u => Buffer.from(u).toString('base64');
const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('budget-gus:' + id.trim().toLowerCase())));
const name = [...h].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');

const iter = 600000, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(content)));
const dir = new URL('../data/users/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(name + '.json', dir), JSON.stringify({ enc: { iter, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) } }));
console.log(`Compte « ${id} » écrit dans data/users/${name}.json`);
