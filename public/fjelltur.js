class User {
  constructor(id, username) {
    this.id = id;
    this.username = username;
  }
}

let currentUser = null;
let modalFjellId = null;

async function main() {
  currentUser = await fetchCurrentUser();
  await lastInnMineTurer();
  await oppdaterForesporselBadge();
}

// ─── FANER ────────────────────────────────────────────────────────────────────

function visFane(faneId) {
  document.querySelectorAll('.fane').forEach(f => f.classList.remove('aktiv'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(faneId).classList.add('aktiv');

  const btnMap = { 'mine-turer': 0, 'venner-turer': 1, 'venner-admin': 2, 'logg-tur': 3, 'legg-til-fjell': 4 };
  document.querySelectorAll('.nav-btn')[btnMap[faneId]]?.classList.add('active');

  if (faneId === 'venner-turer') lastInnVennersTurer();
  if (faneId === 'venner-admin') lastInnVennerAdmin();
  if (faneId === 'logg-tur') lastInnFjellITurSkjema();
  if (faneId === 'legg-til-fjell') lastInnOmraaderISkjema();
}

// ─── MINE TURER ───────────────────────────────────────────────────────────────

async function lastInnMineTurer() {
  const fjellturer = await fetchFjellturer();
  const container = document.getElementById('main');
  container.innerHTML = '';
  if (!fjellturer || fjellturer.length === 0) {
    container.innerHTML = '<p class="ingen-turer">Ingen turer registrert ennå. Logg din første tur!</p>';
    return;
  }
  fjellturer.forEach(tur => container.appendChild(lagTurKort(tur, true)));
}

// ─── VENNERS TURER ────────────────────────────────────────────────────────────

async function lastInnVennersTurer() {
  const container = document.getElementById('venner-turer-grid');
  container.innerHTML = '<p class="laster">Laster turer…</p>';
  try {
    const res = await fetch('/venner/turer');
    const turer = await res.json();
    container.innerHTML = '';
    if (!turer || turer.length === 0) {
      container.innerHTML = '<p class="ingen-turer">Ingen turer fra venner ennå.</p>';
      return;
    }
    turer.forEach(tur => {
      const kort = lagTurKort(tur, false);
      const etikett = document.createElement('div');
      etikett.className = 'venn-etikett';
      etikett.textContent = '👤 ' + tur.hvem;
      kort.querySelector('.card-content').prepend(etikett);
      container.appendChild(kort);
    });
  } catch (e) {
    container.innerHTML = '<p class="feil">Kunne ikke hente turer.</p>';
  }
}

// ─── VENNER-ADMIN ─────────────────────────────────────────────────────────────

async function lastInnVennerAdmin() {
  await lastInnForesporslene();
  await lastInnVenneliste();
}

async function lastInnForesporslene() {
  const liste = document.getElementById('forespørsel-liste');
  try {
    const res = await fetch('/venneforesporsler');
    const foresporsler = await res.json();
    liste.innerHTML = '';
    if (foresporsler.length === 0) {
      liste.innerHTML = '<p class="ingen">Ingen innkommende forespørsler.</p>';
      return;
    }
    foresporsler.forEach(f => {
      const el = document.createElement('div');
      el.className = 'venn-rad';
      el.innerHTML = `
        <span class="venn-navn">👤 ${f.brukernavn}</span>
        <div class="venn-knapper">
          <button class="btn-aksepter" onclick="aksepterVenn(${f.foresporsel_id}, this.closest('.venn-rad'))">Aksepter</button>
          <button class="btn-avvis" onclick="avvisVenn(${f.foresporsel_id}, this.closest('.venn-rad'))">Avvis</button>
        </div>
      `;
      liste.appendChild(el);
    });
  } catch (e) {
    liste.innerHTML = '<p class="feil">Kunne ikke hente forespørsler.</p>';
  }
}

async function lastInnVenneliste() {
  const liste = document.getElementById('venn-liste');
  try {
    const res = await fetch('/venner');
    const venner = await res.json();
    liste.innerHTML = '';
    if (venner.length === 0) {
      liste.innerHTML = '<p class="ingen">Ingen venner ennå.</p>';
      return;
    }
    venner.forEach(v => {
      const el = document.createElement('div');
      el.className = 'venn-rad';
      el.innerHTML = `<span class="venn-navn">🧗 ${v.brukernavn}</span>`;
      liste.appendChild(el);
    });
  } catch (e) {
    liste.innerHTML = '<p class="feil">Kunne ikke hente venner.</p>';
  }
}

async function søkBrukere() {
  const søk = document.getElementById('søk-input').value.trim();
  const resultater = document.getElementById('søk-resultater');
  if (søk.length < 1) { resultater.innerHTML = ''; return; }
  try {
    const res = await fetch(`/brukere?search=${encodeURIComponent(søk)}`);
    const brukere = await res.json();
    resultater.innerHTML = '';
    if (brukere.length === 0) { resultater.innerHTML = '<p class="ingen">Ingen brukere funnet.</p>'; return; }
    brukere.forEach(b => {
      const el = document.createElement('div');
      el.className = 'venn-rad';
      el.innerHTML = `
        <span class="venn-navn">👤 ${b.brukernavn}</span>
        <button class="btn-legg-til" onclick="sendForesporsel(${b.id}, '${b.brukernavn}', this)">Legg til</button>
      `;
      resultater.appendChild(el);
    });
  } catch (e) { resultater.innerHTML = '<p class="feil">Søk feilet.</p>'; }
}

async function sendForesporsel(venn_id, brukernavn, knapp) {
  try {
    const res = await fetch('/venner/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venn_id })
    });
    const data = await res.json();
    if (data.success) { knapp.textContent = 'Sendt ✓'; knapp.disabled = true; knapp.className = 'btn-sendt'; }
    else { knapp.textContent = 'Allerede sendt'; knapp.disabled = true; }
  } catch (e) { knapp.textContent = 'Feil'; }
}

async function aksepterVenn(foresporsel_id, rad) {
  const res = await fetch('/venner/aksepter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foresporsel_id })
  });
  if ((await res.json()).success) { rad.remove(); await lastInnVenneliste(); await oppdaterForesporselBadge(); }
}

async function avvisVenn(foresporsel_id, rad) {
  const res = await fetch('/venner/avvis', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foresporsel_id })
  });
  if ((await res.json()).success) { rad.remove(); await oppdaterForesporselBadge(); }
}

async function oppdaterForesporselBadge() {
  try {
    const res = await fetch('/venneforesporsler');
    const foresporsler = await res.json();
    const badge = document.getElementById('forespørsel-badge');
    if (foresporsler.length > 0) { badge.textContent = foresporsler.length; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
  } catch (e) {}
}

// ─── LOGG TUR (fane) ──────────────────────────────────────────────────────────

async function lastInnFjellITurSkjema() {
  const select = document.getElementById('tur-fjell');
  // Alltid oppdater listen (nye fjell kan ha blitt lagt til)
  select.innerHTML = '<option value="">Velg fjell…</option>';
  try {
    const res = await fetch('/fjell');
    const fjell = await res.json();
    fjell.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.fjellnavn} (${f.hoyde} moh)`;
      select.appendChild(opt);
    });
  } catch (e) { console.error('Kunne ikke laste fjell:', e); }

  // Sett dagens dato som standard
  const datoInput = document.getElementById('tur-dato');
  if (!datoInput.value) datoInput.value = new Date().toISOString().split('T')[0];
}

async function lagreNyTur() {
  const fjell_id = document.getElementById('tur-fjell').value;
  const dato     = document.getElementById('tur-dato').value;
  const varighet = document.getElementById('tur-varighet').value;
  const beskrivelse = document.getElementById('tur-beskrivelse').value.trim();
  const melding  = document.getElementById('tur-melding');

  if (!fjell_id || !dato) {
    visMelding(melding, 'Fjell og dato er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch('/fjellturer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fjell_id: parseInt(fjell_id), dato, varighet: varighet ? parseInt(varighet) : null, beskrivelse })
    });
    const data = await res.json();
    if (data.success) {
      visMelding(melding, 'Turen ble logget!', 'suksess');
      document.getElementById('tur-fjell').value = '';
      document.getElementById('tur-varighet').value = '';
      document.getElementById('tur-beskrivelse').value = '';
      document.getElementById('tur-dato').value = new Date().toISOString().split('T')[0];
      // Oppdater "Mine turer" i bakgrunnen
      lastInnMineTurer();
    } else {
      visMelding(melding, 'Noe gikk galt. Prøv igjen.', 'feil');
    }
  } catch (e) { visMelding(melding, 'Feil ved lagring.', 'feil'); }
}

// ─── MODAL (rask logging fra kort) ───────────────────────────────────────────

function åpneModalForFjell(fjell_id, fjellnavn) {
  modalFjellId = fjell_id;
  document.getElementById('modal-fjellnavn').textContent = '🏔 ' + fjellnavn;
  document.getElementById('modal-dato').value = new Date().toISOString().split('T')[0];
  document.getElementById('modal-varighet').value = '';
  document.getElementById('modal-beskrivelse').value = '';
  document.getElementById('modal-melding').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function lukkModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  modalFjellId = null;
}

async function lagreModalTur() {
  const dato      = document.getElementById('modal-dato').value;
  const varighet  = document.getElementById('modal-varighet').value;
  const beskrivelse = document.getElementById('modal-beskrivelse').value.trim();
  const melding   = document.getElementById('modal-melding');

  if (!dato) { visMelding(melding, 'Dato er påkrevd.', 'feil'); return; }

  try {
    const res = await fetch('/fjellturer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fjell_id: modalFjellId, dato, varighet: varighet ? parseInt(varighet) : null, beskrivelse })
    });
    const data = await res.json();
    if (data.success) {
      lukkModal();
      await lastInnMineTurer();
    } else {
      visMelding(melding, 'Noe gikk galt.', 'feil');
    }
  } catch (e) { visMelding(melding, 'Feil ved lagring.', 'feil'); }
}

// ─── LEGG TIL FJELL ──────────────────────────────────────────────────────────

async function lastInnOmraaderISkjema() {
  const select = document.getElementById('fjell-omraade');
  if (select.options.length > 1) return;
  try {
    const res = await fetch('/omraader');
    const omraader = await res.json();
    omraader.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.navn;
      select.appendChild(opt);
    });
  } catch (e) { console.error('Kunne ikke laste omraader:', e); }
}

async function toggleNyttOmraade() {
  const felt = document.getElementById('nytt-omraade-felt');
  const vis = felt.style.display === 'none' || felt.style.display === '';
  felt.style.display = vis ? 'flex' : 'none';
  if (vis) document.getElementById('nytt-omraade-navn').focus();
}

async function lagreNyttOmraade() {
  const navn = document.getElementById('nytt-omraade-navn').value.trim();
  const beskrivelse = document.getElementById('nytt-omraade-beskrivelse').value.trim();
  const melding = document.getElementById('fjell-melding');
  if (!navn) { visMelding(melding, 'Områdenavn er påkrevd.', 'feil'); return; }

  try {
    const res = await fetch('/omraader', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navn, beskrivelse })
    });
    const data = await res.json();
    if (data.success) {
      const select = document.getElementById('fjell-omraade');
      const opt = document.createElement('option');
      opt.value = data.id;
      opt.textContent = navn;
      select.appendChild(opt);
      select.value = data.id;
      document.getElementById('nytt-omraade-felt').style.display = 'none';
      document.getElementById('nytt-omraade-navn').value = '';
      document.getElementById('nytt-omraade-beskrivelse').value = '';
      visMelding(melding, '"' + navn + '" ble lagt til som nytt område!', 'suksess');
    } else { visMelding(melding, 'Kunne ikke lagre området.', 'feil'); }
  } catch (e) { visMelding(melding, 'Feil ved lagring av område.', 'feil'); }
}

async function lagreNyttFjell() {
  const navn      = document.getElementById('fjell-navn').value.trim();
  const hoyde     = document.getElementById('fjell-hoyde').value.trim();
  const omraade_id = document.getElementById('fjell-omraade').value;
  const beskrivelse = document.getElementById('fjell-beskrivelse').value.trim();
  const foto      = document.getElementById('fjell-foto').value.trim();
  const melding   = document.getElementById('fjell-melding');

  if (!navn || !hoyde || !omraade_id) {
    visMelding(melding, 'Fjellnavn, høyde og område er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch('/fjell', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navn, hoyde: parseInt(hoyde), omraade_id: parseInt(omraade_id), beskrivelse, foto })
    });
    const data = await res.json();
    if (data.success) {
      visMelding(melding, '"' + navn + '" ble lagt til!', 'suksess');
      document.getElementById('fjell-navn').value = '';
      document.getElementById('fjell-hoyde').value = '';
      document.getElementById('fjell-omraade').value = '';
      document.getElementById('fjell-beskrivelse').value = '';
      document.getElementById('fjell-foto').value = '';
    } else { visMelding(melding, 'Noe gikk galt. Prøv igjen.', 'feil'); }
  } catch (e) { visMelding(melding, 'Feil ved lagring.', 'feil'); }
}

// ─── HJELPEFUNKSJONER ─────────────────────────────────────────────────────────

function lagTurKort(tur, visLoggKnapp) {
  const card = document.createElement('div');
  card.className = 'card';
  const bildeNavn = tur.fjellnavn ? tur.fjellnavn.replace(/ /g, '') : '';

  const varighetTekst = tur.varighet ? `⏱ ${tur.varighet} min` : '';
  const loggKnapp = visLoggKnapp
    ? `<button class="btn-logg-tur" onclick="åpneModalForFjell(${tur.fjell_id || 'null'}, '${tur.fjellnavn}')">+ Logg ny tur her</button>`
    : '';

  card.innerHTML = `
    <img src="./img/${bildeNavn}.jpg" alt="${tur.fjellnavn}" onerror="this.style.display='none'">
    <div class="card-content">
      <div class="header">
        <h3>${tur.fjellnavn}</h3>
        <span class="height">${tur.hoyde} moh</span>
      </div>
      <div class="area">${tur.omraade}</div>
      <div class="date">${tur.tidspunkt} ${varighetTekst}</div>
      <div class="desc">${tur.fjellbeskrivelse || ''}</div>
      <div class="desc">${tur.turbeskrivelse || ''}</div>
      ${loggKnapp}
    </div>
  `;
  return card;
}

function visMelding(el, tekst, type) {
  el.textContent = tekst;
  el.className = 'skjema-melding ' + type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

async function fetchCurrentUser() {
  try {
    const response = await fetch('/currentUser');
    let user = await response.json();
    return new User(user[0], user[1]);
  } catch (error) { console.log('Failed to fetch currentUser:', error); }
}

async function fetchFjellturer() {
  try {
    const response = await fetch('/fjellturer');
    return await response.json();
  } catch (error) { console.log('Failed to fetch fjellturer:', error); return null; }
}

document.addEventListener('DOMContentLoaded', main);
