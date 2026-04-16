// ─── TILSTAND ─────────────────────────────────────────────────────────────────

// Holder på innlogget bruker og hvilket fjell som er åpent i modal
let currentUser = null;
let modalFjellId = null;

// Kjøres når siden er ferdig lastet
async function main() {
  currentUser = await hentInnloggetBruker();
  await lastInnMineTurer();
  await oppdaterForesporselBadge();
}

// ─── FANER ────────────────────────────────────────────────────────────────────

// Bytter mellom de ulike fanene i appen
function visFane(faneId) {
  // Skjul alle faner og fjern aktiv-markering på nav-knapper
  document.querySelectorAll('.fane').forEach(f => f.classList.remove('aktiv'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Vis valgt fane og marker riktig nav-knapp
  document.getElementById(faneId).classList.add('aktiv');
  const navKnappIndeks = { 'mine-turer': 0, 'venner-turer': 1, 'venner-admin': 2, 'logg-tur': 3, 'legg-til-fjell': 4 };
  document.querySelectorAll('.nav-btn')[navKnappIndeks[faneId]]?.classList.add('active');

  // Last inn data for faner som trenger det
  if (faneId === 'venner-turer')   lastInnVennersTurer();
  if (faneId === 'venner-admin')   lastInnVennerAdmin();
  if (faneId === 'logg-tur')       lastInnFjellITurSkjema();
  if (faneId === 'legg-til-fjell') { lastInnOmraaderISkjema(); lastInnFjellListe(); }
}

// ─── MINE TURER ───────────────────────────────────────────────────────────────

async function lastInnMineTurer() {
  const fjellturer = await hentFjellturer();
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
      // Legg til etikett som viser hvem sin tur det er
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
          <button class="btn-avvis"    onclick="avvisVenn(${f.foresporsel_id}, this.closest('.venn-rad'))">Avvis</button>
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
    const res = await fetch('/venner/med-id');
    const venner = await res.json();
    liste.innerHTML = '';

    if (venner.length === 0) {
      liste.innerHTML = '<p class="ingen">Ingen venner ennå.</p>';
      return;
    }

    venner.forEach(v => {
      const el = document.createElement('div');
      el.className = 'venn-rad';
      el.innerHTML = `
        <span class="venn-navn">🧗 ${v.brukernavn}</span>
        <button class="btn-avvis" onclick="slettVenn(${v.relasjon_id}, '${v.brukernavn}', this.closest('.venn-rad'))">🗑 Fjern</button>
      `;
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

    if (brukere.length === 0) {
      resultater.innerHTML = '<p class="ingen">Ingen brukere funnet.</p>';
      return;
    }

    brukere.forEach(b => {
      const el = document.createElement('div');
      el.className = 'venn-rad';
      el.innerHTML = `
        <span class="venn-navn">👤 ${b.brukernavn}</span>
        <button class="btn-legg-til" onclick="sendForesporsel(${b.id}, '${b.brukernavn}', this)">Legg til</button>
      `;
      resultater.appendChild(el);
    });
  } catch (e) {
    resultater.innerHTML = '<p class="feil">Søk feilet.</p>';
  }
}

async function sendForesporsel(venn_id, brukernavn, knapp) {
  try {
    const res = await fetch('/venner/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venn_id })
    });
    const data = await res.json();

    if (data.success) {
      knapp.textContent = 'Sendt ✓';
      knapp.disabled = true;
      knapp.className = 'btn-sendt';
    } else {
      knapp.textContent = 'Allerede sendt';
      knapp.disabled = true;
    }
  } catch (e) {
    knapp.textContent = 'Feil';
  }
}

async function aksepterVenn(foresporsel_id, rad) {
  const res = await fetch('/venner/aksepter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foresporsel_id })
  });
  if ((await res.json()).success) {
    rad.remove();
    await lastInnVenneliste();
    await oppdaterForesporselBadge();
  }
}

async function avvisVenn(foresporsel_id, rad) {
  const res = await fetch('/venner/avvis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foresporsel_id })
  });
  if ((await res.json()).success) {
    rad.remove();
    await oppdaterForesporselBadge();
  }
}

async function oppdaterForesporselBadge() {
  try {
    const res = await fetch('/venneforesporsler');
    const foresporsler = await res.json();
    const badge = document.getElementById('forespørsel-badge');

    if (foresporsler.length > 0) {
      badge.textContent = foresporsler.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) { /* Ignorer feil her — badge er ikke kritisk */ }
}

// ─── LOGG TUR (fane) ──────────────────────────────────────────────────────────

async function lastInnFjellITurSkjema() {
  const select = document.getElementById('tur-fjell');
  // Nullstill og hent fersk liste (nye fjell kan ha blitt lagt til siden sist)
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
  } catch (e) {
    console.error('Kunne ikke laste fjell:', e);
  }

  // Sett dagens dato som standard hvis feltet er tomt
  const datoInput = document.getElementById('tur-dato');
  if (!datoInput.value) datoInput.value = new Date().toISOString().split('T')[0];
}

async function lagreNyTur() {
  const fjell_id    = document.getElementById('tur-fjell').value;
  const dato        = document.getElementById('tur-dato').value;
  const varighet    = document.getElementById('tur-varighet').value;
  const beskrivelse = document.getElementById('tur-beskrivelse').value.trim();
  const melding     = document.getElementById('tur-melding');

  if (!fjell_id || !dato) {
    visMelding(melding, 'Fjell og dato er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch('/fjellturer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fjell_id: parseInt(fjell_id),
        dato,
        varighet: varighet ? parseInt(varighet) : null,
        beskrivelse
      })
    });
    const data = await res.json();

    if (data.success) {
      visMelding(melding, 'Turen ble logget!', 'suksess');
      // Nullstill skjemaet
      document.getElementById('tur-fjell').value = '';
      document.getElementById('tur-varighet').value = '';
      document.getElementById('tur-beskrivelse').value = '';
      document.getElementById('tur-dato').value = new Date().toISOString().split('T')[0];
      lastInnMineTurer(); // Oppdater "Mine turer" i bakgrunnen
    } else {
      visMelding(melding, 'Noe gikk galt. Prøv igjen.', 'feil');
    }
  } catch (e) {
    visMelding(melding, 'Feil ved lagring.', 'feil');
  }
}

// ─── MODAL (rask logging direkte fra et turkort) ──────────────────────────────

function åpneModalForFjell(fjell_id, fjellnavn) {
  // FIX: Sjekk at vi faktisk har et gyldig fjell_id før vi åpner modalen
  if (!fjell_id) {
    console.error('Mangler fjell_id — kan ikke logge tur.');
    return;
  }

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
  const dato        = document.getElementById('modal-dato').value;
  const varighet    = document.getElementById('modal-varighet').value;
  const beskrivelse = document.getElementById('modal-beskrivelse').value.trim();
  const melding     = document.getElementById('modal-melding');

  // FIX: Valider at vi har fjell_id (ellers får vi 400 Bad Request fra serveren)
  if (!modalFjellId) {
    visMelding(melding, 'Ugyldig fjell. Lukk og prøv igjen.', 'feil');
    return;
  }
  if (!dato) {
    visMelding(melding, 'Dato er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch('/fjellturer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fjell_id: modalFjellId,   // allerede et tall, satt i åpneModalForFjell()
        dato,
        varighet: varighet ? parseInt(varighet) : null,
        beskrivelse
      })
    });
    const data = await res.json();

    if (data.success) {
      lukkModal();
      await lastInnMineTurer();
    } else {
      visMelding(melding, 'Noe gikk galt.', 'feil');
    }
  } catch (e) {
    visMelding(melding, 'Feil ved lagring.', 'feil');
  }
}

// ─── LEGG TIL FJELL ──────────────────────────────────────────────────────────

async function lastInnOmraaderISkjema() {
  const select = document.getElementById('fjell-omraade');
  // Ikke last på nytt hvis listen allerede er fylt ut
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
  } catch (e) {
    console.error('Kunne ikke laste områder:', e);
  }
}

function toggleNyttOmraade() {
  const felt = document.getElementById('nytt-omraade-felt');
  const skalVises = felt.style.display === 'none' || felt.style.display === '';
  felt.style.display = skalVises ? 'flex' : 'none';
  if (skalVises) document.getElementById('nytt-omraade-navn').focus();
}

async function lagreNyttOmraade() {
  const navn        = document.getElementById('nytt-omraade-navn').value.trim();
  const beskrivelse = document.getElementById('nytt-omraade-beskrivelse').value.trim();
  const melding     = document.getElementById('fjell-melding');

  if (!navn) { visMelding(melding, 'Områdenavn er påkrevd.', 'feil'); return; }

  try {
    const res = await fetch('/omraader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navn, beskrivelse })
    });
    const data = await res.json();

    if (data.success) {
      // Legg det nye området til i nedtrekkslisten og velg det automatisk
      const select = document.getElementById('fjell-omraade');
      const opt = document.createElement('option');
      opt.value = data.id;
      opt.textContent = navn;
      select.appendChild(opt);
      select.value = data.id;

      // Skjul og nullstill "nytt område"-feltet
      document.getElementById('nytt-omraade-felt').style.display = 'none';
      document.getElementById('nytt-omraade-navn').value = '';
      document.getElementById('nytt-omraade-beskrivelse').value = '';

      visMelding(melding, `"${navn}" ble lagt til som nytt område!`, 'suksess');
    } else {
      visMelding(melding, 'Kunne ikke lagre området.', 'feil');
    }
  } catch (e) {
    visMelding(melding, 'Feil ved lagring av område.', 'feil');
  }
}

async function lagreNyttFjell() {
  const navn        = document.getElementById('fjell-navn').value.trim();
  const hoyde       = document.getElementById('fjell-hoyde').value.trim();
  const omraade_id  = document.getElementById('fjell-omraade').value;
  const beskrivelse = document.getElementById('fjell-beskrivelse').value.trim();
  const foto        = document.getElementById('fjell-foto').value.trim();
  const melding     = document.getElementById('fjell-melding');

  if (!navn || !hoyde || !omraade_id) {
    visMelding(melding, 'Fjellnavn, høyde og område er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch('/fjell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        navn,
        hoyde: parseInt(hoyde),
        omraade_id: parseInt(omraade_id),
        beskrivelse,
        foto
      })
    });
    const data = await res.json();

    if (data.success) {
      visMelding(melding, `"${navn}" ble lagt til!`, 'suksess');
      // Nullstill skjemaet
      document.getElementById('fjell-navn').value = '';
      document.getElementById('fjell-hoyde').value = '';
      document.getElementById('fjell-omraade').value = '';
      document.getElementById('fjell-beskrivelse').value = '';
      document.getElementById('fjell-foto').value = '';
    } else {
      visMelding(melding, 'Noe gikk galt. Prøv igjen.', 'feil');
    }
  } catch (e) {
    visMelding(melding, 'Feil ved lagring.', 'feil');
  }
}

// ─── SLETT TUR ────────────────────────────────────────────────────────────────

async function slettTur(tur_id, kortElement) {
  if (!confirm('Er du sikker på at du vil slette denne turen?')) return;
  try {
    const res = await fetch(`/fjellturer/${tur_id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      kortElement.remove();
    } else {
      alert('Kunne ikke slette turen.');
    }
  } catch (e) {
    alert('Feil ved sletting.');
  }
}

// ─── REDIGER TUR ──────────────────────────────────────────────────────────────

let redigerTurId = null;

async function åpneRedigerTur(tur) {
  redigerTurId = tur.id;

  // Fyll fjell-dropdown
  const select = document.getElementById('rediger-tur-fjell');
  select.innerHTML = '<option value="">Velg fjell…</option>';
  try {
    const res = await fetch('/fjell');
    const fjell = await res.json();
    fjell.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.fjellnavn} (${f.hoyde} moh)`;
      if (f.id === tur.fjell_id) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {}

  document.getElementById('rediger-tur-dato').value = tur.tidspunkt;
  document.getElementById('rediger-tur-varighet').value = tur.varighet || '';
  document.getElementById('rediger-tur-beskrivelse').value = tur.turbeskrivelse || '';
  document.getElementById('rediger-tur-melding').classList.add('hidden');
  document.getElementById('rediger-tur-overlay').classList.remove('hidden');
}

function lukkRedigerTur() {
  document.getElementById('rediger-tur-overlay').classList.add('hidden');
  redigerTurId = null;
}

async function lagreRedigertTur() {
  const fjell_id    = document.getElementById('rediger-tur-fjell').value;
  const dato        = document.getElementById('rediger-tur-dato').value;
  const varighet    = document.getElementById('rediger-tur-varighet').value;
  const beskrivelse = document.getElementById('rediger-tur-beskrivelse').value.trim();
  const melding     = document.getElementById('rediger-tur-melding');

  if (!fjell_id || !dato) {
    visMelding(melding, 'Fjell og dato er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch(`/fjellturer/${redigerTurId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fjell_id: parseInt(fjell_id), dato, varighet: varighet ? parseInt(varighet) : null, beskrivelse })
    });
    const data = await res.json();
    if (data.success) {
      lukkRedigerTur();
      await lastInnMineTurer();
    } else {
      visMelding(melding, 'Kunne ikke oppdatere turen.', 'feil');
    }
  } catch (e) {
    visMelding(melding, 'Feil ved lagring.', 'feil');
  }
}

// ─── REDIGER FJELL ────────────────────────────────────────────────────────────

let redigerFjellId = null;

async function åpneRedigerFjell(fjell) {
  redigerFjellId = fjell.id;

  // Fyll område-dropdown
  const select = document.getElementById('rediger-fjell-omraade');
  select.innerHTML = '';
  try {
    const res = await fetch('/omraader');
    const omraader = await res.json();
    omraader.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.navn;
      if (o.id === fjell.omraade_id) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {}

  document.getElementById('rediger-fjell-navn').value = fjell.fjellnavn;
  document.getElementById('rediger-fjell-hoyde').value = fjell.hoyde;
  document.getElementById('rediger-fjell-beskrivelse').value = fjell.beskrivelse || '';
  document.getElementById('rediger-fjell-foto').value = fjell.foto || '';
  document.getElementById('rediger-fjell-melding').classList.add('hidden');
  document.getElementById('rediger-fjell-overlay').classList.remove('hidden');
}

function lukkRedigerFjell() {
  document.getElementById('rediger-fjell-overlay').classList.add('hidden');
  redigerFjellId = null;
}

async function lagreRedigertFjell() {
  const navn        = document.getElementById('rediger-fjell-navn').value.trim();
  const hoyde       = document.getElementById('rediger-fjell-hoyde').value.trim();
  const omraade_id  = document.getElementById('rediger-fjell-omraade').value;
  const beskrivelse = document.getElementById('rediger-fjell-beskrivelse').value.trim();
  const foto        = document.getElementById('rediger-fjell-foto').value.trim();
  const melding     = document.getElementById('rediger-fjell-melding');

  if (!navn || !hoyde || !omraade_id) {
    visMelding(melding, 'Fjellnavn, høyde og område er påkrevd.', 'feil');
    return;
  }

  try {
    const res = await fetch(`/fjell/${redigerFjellId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navn, hoyde: parseInt(hoyde), omraade_id: parseInt(omraade_id), beskrivelse, foto })
    });
    const data = await res.json();
    if (data.success) {
      lukkRedigerFjell();
      visMelding(document.getElementById('fjell-melding'), `"${navn}" er oppdatert!`, 'suksess');
    } else {
      visMelding(melding, 'Kunne ikke oppdatere fjellet.', 'feil');
    }
  } catch (e) {
    visMelding(melding, 'Feil ved lagring.', 'feil');
  }
}

async function slettFjell(fjell_id, fjellnavn) {
  if (!confirm(`Slette "${fjellnavn}"? Dette er kun mulig hvis fjellet ikke har registrerte turer.`)) return;
  try {
    const res = await fetch(`/fjell/${fjell_id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      // Oppdater fjell-listen i "Legg til fjell"-fanen
      document.querySelectorAll('.fjell-rad').forEach(rad => {
        if (parseInt(rad.dataset.id) === fjell_id) rad.remove();
      });
    } else {
      alert(data.error || 'Kunne ikke slette fjellet.');
    }
  } catch (e) {
    alert('Feil ved sletting.');
  }
}

// ─── FJELL-LISTE (i legg-til-fjell-fanen) ────────────────────────────────────

async function lastInnFjellListe() {
  const container = document.getElementById('fjell-liste-container');
  if (!container) return;
  try {
    const res = await fetch('/fjell');
    const fjellListe = await res.json();
    container.innerHTML = '';
    fjellListe.forEach(f => {
      const rad = document.createElement('div');
      rad.className = 'fjell-rad venn-rad';
      rad.dataset.id = f.id;
      rad.innerHTML = `
        <span class="venn-navn">🏔 ${f.fjellnavn} <small>(${f.hoyde} moh · ${f.omraade})</small></span>
        <div class="venn-knapper">
          <button class="btn-aksepter" onclick='åpneRedigerFjell(${JSON.stringify(f)})'>✏️ Rediger</button>
          <button class="btn-avvis" onclick="slettFjell(${f.id}, '${f.fjellnavn}')">🗑 Slett</button>
        </div>
      `;
      container.appendChild(rad);
    });
  } catch (e) { console.error(e); }
}

// ─── SLETT VENN ───────────────────────────────────────────────────────────────

async function slettVenn(relasjon_id, brukernavn, radElement) {
  if (!confirm(`Fjerne ${brukernavn} som venn?`)) return;
  try {
    const res = await fetch(`/venner/${relasjon_id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      radElement.remove();
    } else {
      alert('Kunne ikke fjerne venn.');
    }
  } catch (e) {
    alert('Feil ved sletting.');
  }
}

// ─── HJELPEFUNKSJONER ─────────────────────────────────────────────────────────

// Lager et turkort-element med riktig CSS-klasser (samsvarer med fjelltur.css)
function lagTurKort(tur, visLoggKnapp) {
  const card = document.createElement('div');
  card.className = 'card';

  // Bildesti: fjerner mellomrom fra fjellnavnet for å matche filnavn, f.eks. "Fannaråken.jpg"
  const bildeFilnavn = tur.fjellnavn ? tur.fjellnavn.replace(/ /g, '') : '';

  const varighetTekst = tur.varighet ? `⏱ ${tur.varighet} min` : '';

  // FIX: Sjekk at fjell_id finnes før vi lager logg-knappen (unngår null-POST → 400)
  const loggKnapp = (visLoggKnapp && tur.fjell_id)
    ? `<button class="btn-logg-tur" onclick="åpneModalForFjell(${tur.fjell_id}, '${tur.fjellnavn}')">+ Logg ny tur her</button>`
    : '';

  const redigerSlett = visLoggKnapp ? `
    <div class="crud-knapper">
      <button class="btn-rediger-tur" onclick='åpneRedigerTur(${JSON.stringify(tur)})'>✏️ Rediger</button>
      <button class="btn-slett-tur" onclick="slettTur(${tur.id}, this.closest('.card'))">🗑 Slett</button>
    </div>` : '';

  card.innerHTML = `
    <img src="./img/${bildeFilnavn}.jpg" alt="${tur.fjellnavn}" onerror="this.style.display='none'">
    <div class="card-content">
      <div class="card-header-row">
        <h3 class="card-name">${tur.fjellnavn}</h3>
        <span class="height-badge">${tur.hoyde} moh</span>
      </div>
      <div class="area-label">${tur.omraade}</div>
      <div class="date-label">${tur.tidspunkt} ${varighetTekst}</div>
      <div class="desc-text">${tur.fjellbeskrivelse || ''}</div>
      <div class="desc-text">${tur.turbeskrivelse || ''}</div>
      ${loggKnapp}
      ${redigerSlett}
    </div>
  `;
  return card;
}

// Viser en midlertidig melding (suksess eller feil) i et skjema
function visMelding(el, tekst, type) {
  el.textContent = tekst;
  el.className = 'skjema-melding ' + type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

async function hentInnloggetBruker() {
  try {
    const res = await fetch('/currentUser');
    const user = await res.json();
    return { id: user[0], brukernavn: user[1] };
  } catch (e) {
    console.error('Kunne ikke hente innlogget bruker:', e);
    return null;
  }
}

async function hentFjellturer() {
  try {
    const res = await fetch('/fjellturer');
    return await res.json();
  } catch (e) {
    console.error('Kunne ikke hente fjellturer:', e);
    return null;
  }
}

// Start appen når HTML-en er ferdig lastet
document.addEventListener('DOMContentLoaded', main);
