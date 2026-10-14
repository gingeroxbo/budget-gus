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

  async function decrypt(enc, code) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
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
        let data;
        try {
          const r = await fetch(await fileFor(id), { cache: 'no-cache' });
          if (!r.ok) throw new Error('absent');
          data = await r.json();
        } catch (e) {
          throw new Error(navigator.onLine ? 'refus' : 'reseau');
        }
        const content = await decrypt(data.enc, code);
        mem.set(id);
        $('code').value = '';
        $('lock').hidden = true;
        render(content, id);
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
