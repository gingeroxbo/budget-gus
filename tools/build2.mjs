// Dépose de nouveaux chiffres sans connaître le mot de passe (format v2).
// Prérequis : data/users/<empreinte>.keys.json, créé à partir du code d'activation (node tools/activate.mjs <code>).
// Usage : node tools/build2.mjs <empreinte> contenu.html contenu.js "18 oct. 2026"
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [name, html, js, updated] = process.argv.slice(2);
if (!name || !html || !js) { console.error('Usage : node tools/build2.mjs <empreinte> contenu.html contenu.js "<date>"'); process.exit(1); }
const dir = new URL('../data/users/', import.meta.url);
const keys = JSON.parse(readFileSync(new URL(name + '.keys.json', dir), 'utf8'));
const b64 = u => Buffer.from(u).toString('base64');
const pub = await crypto.subtle.importKey('spki', Buffer.from(keys.pub, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
const raw = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
const content = { html: readFileSync(html, 'utf8'), js: readFileSync(js, 'utf8'), updated };
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(content)));
const wk = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
writeFileSync(new URL(name + '.json', dir), JSON.stringify({ v: 2, wk: b64(new Uint8Array(wk)), iv: b64(iv), ct: b64(new Uint8Array(ct)) }));
console.log(`Chiffres déposés dans data/users/${name}.json (format v2)`);
