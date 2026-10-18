/* Budget : connexion par identifiant + mot de passe, contenu chiffré propre à chaque personne, mode hors connexion. */
(function () {
  // Le mot de passe n'est jamais enregistré : il est demandé à chaque ouverture.
  // Seul l'identifiant est retenu sur cet appareil, pour le pré-remplir.
  const ID_KEY = 'budget-id';
  const mem = {
    get() { try { return localStorage.getItem(ID_KEY) || ''; } catch (e) { return ''; } },
    set(v) { try { localStorage.setItem(ID_KEY, v); } catch (e) {} }
  };
  try { localStorage.removeItem('budget-code'); } catch (e) {}
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const $ = id => document.getElementById(id);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // Le nom du fichier de chaque personne est une empreinte de son identifiant : la liste des comptes ne se lit pas.
  async function fileFor(id) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('budget-gus:' + id.trim().toLowerCase()));
    return 'data/users/' + [...new Uint8Array(h)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('') + '.json';
  }

  const u64 = u => btoa(String.fromCharCode(...new Uint8Array(u)));

  async function pwKey(code, salt, iter, use) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, [use]);
  }
  async function openWithPassword(enc, code) {
    const key = await pwKey(code, b64(enc.salt), enc.iter, 'decrypt');
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
  }

  // Ancien format (v1) : le contenu est chiffré directement avec le mot de passe.
  // Nouveau format (v2) : le contenu est chiffré avec une clé à usage unique, elle-même verrouillée par la clé publique
  // du compte ; la clé privée correspondante n'existe que chiffrée par le mot de passe (fichier .keys.json).
  // Claude peut donc déposer de nouveaux chiffres sans jamais connaître le mot de passe, et seul le mot de passe les ouvre.
  async function decrypt(data, code, keys) {
    if (!data.v) return JSON.parse(new TextDecoder().decode(await openWithPassword(data.enc, code)));
    const pk = await crypto.subtle.importKey('pkcs8', await openWithPassword(keys.priv, code), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, pk, b64(data.wk));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(data.iv) }, key, b64(data.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // Code d'activation : clé publique + clé privée chiffrée par le mot de passe. Il ne permet pas de lire le budget.
  async function makeActivation(file, code) {
    const kp = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const pub = await crypto.subtle.exportKey('spki', kp.publicKey);
    const priv = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
    const iter = 600000, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(code, salt, iter, 'encrypt'), priv);
    return 'BUDGET-ACTIVATION:' + btoa(JSON.stringify({ f: file.split('/').pop().replace('.json', ''), pub: u64(pub), priv: { iter, salt: u64(salt), iv: u64(iv), ct: u64(ct) } }));
  }

  function offerActivation(file, code) {
    const sA = $('app').querySelector('.sA') || $('app');
    const nav = sA.querySelector('.mtabs');
    (nav || sA).insertAdjacentHTML(nav ? 'afterend' : 'afterbegin', `<div class="activ" id="activ"><h2>Mises à jour automatiques</h2>
      <p>Active-les une fois : Claude pourra déposer tes nouveaux chiffres à chaque relevé sans connaître ton mot de passe.</p>
      <button type="button" id="activBtn">Activer les mises à jour automatiques</button></div>`);
    $('activBtn').onclick = async () => {
      const box = $('activ'); $('activBtn').disabled = true; $('activBtn').textContent = 'Préparation…';
      try {
        const txt = await makeActivation(file, code);
        box.innerHTML = `<h2>Ton code d'activation</h2><p>Copie-le et envoie-le à Claude dans ton projet Budget. Il ne permet pas d'ouvrir ton budget.</p>
          <textarea id="activTxt" readonly rows="5"></textarea><button type="button" id="activCopy">Copier le code</button>`;
        $('activTxt').value = txt;
        $('activCopy').onclick = async () => {
          try { await navigator.clipboard.writeText(txt); } catch (e) { $('activTxt').select(); document.execCommand('copy'); }
          $('activCopy').textContent = 'Copié ✓';
        };
      } catch (e) { box.innerHTML = '<p>Impossible de créer le code sur cet appareil. Réessaie depuis Safari.</p>'; }
    };
  }

  function render(content, id) {
    const app = $('app');
    app.innerHTML = content.html;
    const s = document.createElement('script');
    s.textContent = content.js;
    document.body.appendChild(s);
    const sA = app.querySelector('.sA') || app;
    sA.insertAdjacentHTML('beforeend', '<div class="lockbar"><button type="button" id="relock">Se déconnecter</button></div>');
    $('relock').onclick = () => location.reload();
    // Dès que l'app passe en arrière-plan, on efface l'écran ; au retour, le mot de passe est redemandé.
    let away = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { away = true; app.innerHTML = ''; }
      else if (away) location.reload();
    });
    window.addEventListener('pagehide', () => { app.innerHTML = ''; });
    sA.insertAdjacentHTML('beforeend', `<p class="offline">Connecté : ${id.replace(/[<>&"]/g, '')}${content.updated ? ' · mis à jour le ' + content.updated : ''}${navigator.onLine ? '' : ' · hors connexion'}</p>`);
  }

  function start() {
    const form = $('lockForm'), btn = form.querySelector('button');
    $('lock').hidden = false;
    $('user').value = mem.get();
    ($('user').value ? $('code') : $('user')).focus();
    form.onsubmit = async ev => {
      ev.preventDefault();
      const id = $('user').value.trim(), code = $('code').value;
      btn.disabled = true; btn.textContent = 'Ouverture…'; $('err').textContent = '';
      try {
        let data, keys = null;
        const file = await fileFor(id);
        try {
          const r = await fetch(file, { cache: 'no-cache' });
          if (!r.ok) throw new Error('absent');
          data = await r.json();
        } catch (e) {
          throw new Error(navigator.onLine ? 'refus' : 'reseau');
        }
        try {
          const k = await fetch(file.replace('.json', '.keys.json'), { cache: 'no-cache' });
          if (k.ok) keys = await k.json();
        } catch (e) {}
        if (data.v && !keys) throw new Error(navigator.onLine ? 'refus' : 'reseau');
        const content = await decrypt(data, code, keys);
        mem.set(id);
        $('code').value = '';
        $('lock').hidden = true;
        render(content, id);
        if (!keys) offerActivation(file, code);
      } catch (e) {
        $('err').textContent = e.message === 'reseau'
          ? 'Pas de réseau, et ce compte n\'a jamais été ouvert sur cet appareil. Connecte-toi une première fois en wifi.'
          : 'Identifiant ou mot de passe incorrect.';
      }
      btn.disabled = false; btn.textContent = 'Ouvrir';
    };
  }
  start();
})();
