// Enregistre le code d'activation envoyé depuis l'appli : data/users/<empreinte>.keys.json
// Le fichier contient la clé publique et la clé privée chiffrée par le mot de passe : il ne permet pas de lire le budget.
// Usage : node tools/activate.mjs "BUDGET-ACTIVATION:..."
import { writeFileSync } from 'node:fs';
const code = (process.argv[2] || '').trim().replace(/^BUDGET-ACTIVATION:/, '');
const a = JSON.parse(Buffer.from(code, 'base64').toString('utf8'));
if (!/^[0-9a-f]{32}$/.test(a.f) || !a.pub || !a.priv?.ct) { console.error('Code invalide'); process.exit(1); }
writeFileSync(new URL(`../data/users/${a.f}.keys.json`, import.meta.url), JSON.stringify({ pub: a.pub, priv: a.priv }));
console.log(`Clés enregistrées pour data/users/${a.f}.json`);
