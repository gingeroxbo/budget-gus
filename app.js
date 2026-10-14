/* Budget Gus : charge le contenu (chiffré ou non), l'affiche, et installe le mode hors connexion. */
(function () {
  // Le code n'est jamais enregistré : il est demandé à chaque ouverture.
  try { localStorage.removeItem('budget-code'); } catch (e) {}
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  async function decrypt(enc, code) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  function render(content, locked) {
    const app = document.getElementById('app');
    app.innerHTML = content.html;
    const s = document.createElement('script');
    s.textContent = content.js;
    document.body.appendChild(s);
    const sA = app.querySelector('.sA') || app;
    if (locked) {
      sA.insertAdjacentHTML('beforeend', '<div class="lockbar"><button type="button" id="relock">Verrouiller maintenant</button></div>');
      document.getElementById('relock').onclick = () => location.reload();
      // Dès que l'app passe en arrière-plan, on efface l'écran ; au retour, le code est redemandé.
      let away = false;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { away = true; app.innerHTML = ''; }
        else if (away) location.reload();
      });
      window.addEventListener('pagehide', () => { app.innerHTML = ''; });
    }
    if (content.updated) sA.insertAdjacentHTML('beforeend', `<p class="offline">Mis à jour le ${content.updated}${navigator.onLine ? '' : ' · hors connexion'}</p>`);
  }

  function showLock(msg) {
    document.getElementById('lock').hidden = false;
    document.getElementById('err').textContent = msg || '';
  }

  async function start() {
    let data;
    try {
      const r = await fetch('data/budget.json', { cache: 'no-cache' });
      data = await r.json();
    } catch (e) {
      document.getElementById('app').innerHTML = '<div class="lock"><form><h1>Budget</h1><p>Ouvre l\'app une première fois avec du réseau (wifi) pour l\'enregistrer sur ton téléphone.</p></form></div>';
      return;
    }
    if (!data.enc) { render(data, false); return; }

    const form = document.getElementById('lockForm');
    form.onsubmit = async ev => {
      ev.preventDefault();
      const code = document.getElementById('code').value.trim();
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Ouverture…';
      try {
        const content = await decrypt(data.enc, code);
        document.getElementById('code').value = '';
        document.getElementById('lock').hidden = true;
        render(content, true);
      } catch (e) {
        showLock('Code incorrect. Réessaie.');
      }
      btn.disabled = false; btn.textContent = 'Ouvrir';
    };

    showLock();
    document.getElementById('code').focus();
  }
  start();
})();
