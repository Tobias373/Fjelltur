const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const sqlite3 = require('better-sqlite3');
const session = require('express-session');
const dotenv = require('dotenv');

dotenv.config();

const db = sqlite3('./fjelltur.db', { verbose: console.log });
const app = express();
const staticPath = path.join(__dirname, 'public');
const saltRounds = 10;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(staticPath));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// ─── AUTENTISERING ────────────────────────────────────────────────────────────

// Middleware: send til login-siden hvis brukeren ikke er innlogget
function checkLoggedIn(req, res, next) {
    if (!req.session.loggedIn) {
        return res.sendFile(path.join(__dirname, "public/login.html"));
    }
    next();
}

// Sjekk brukernavn + passord mot databasen
function checkUserPassword(username, password) {
    const sql = db.prepare('SELECT id as brukerid, brukernavn, passord FROM person WHERE brukernavn = ?');
    const user = sql.get(username);
    if (user && bcrypt.compareSync(password, user.passord)) {
        return user;
    }
    return null;
}

// Opprett ny bruker og returner den
function addUser(username, password, email) {
    const hash = bcrypt.hashSync(password, saltRounds);
    const insert = db.prepare("INSERT INTO person (brukernavn, passord, epost) VALUES (?, ?, ?)");
    const info = insert.run(username, hash, email);
    return db.prepare('SELECT id as brukerid, brukernavn FROM person WHERE id = ?').get(info.lastInsertRowid);
}

app.post('/login', (req, res) => {
    try {
        const user = checkUserPassword(req.body.username, req.body.password);
        if (user) {
            req.session.loggedIn = true;
            req.session.username = user.brukernavn;
            req.session.userid = user.brukerid;
            return res.redirect('/');
        }
        // Feil brukernavn eller passord
        return res.sendFile(path.join(__dirname, "public/login.html"));
    } catch (error) {
        console.error(error);
        return res.sendFile(path.join(__dirname, "public/login.html"));
    }
});

app.post('/register', (req, res) => {
    try {
        const user = addUser(req.body.username, req.body.password, req.body.epost);
        if (user) {
            req.session.loggedIn = true;
            req.session.username = user.brukernavn;
            req.session.userid = user.brukerid;
            // FIX: redirect til appen etter registrering (ikke bare send true/false)
            return res.redirect('/');
        }
        return res.sendFile(path.join(__dirname, "public/login.html"));
    } catch (error) {
        console.error(error);
        return res.sendFile(path.join(__dirname, "public/login.html"));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    return res.sendFile(path.join(__dirname, "public/login.html"));
});

// ─── SIDER ────────────────────────────────────────────────────────────────────

app.get('/', checkLoggedIn, (req, res) => {
    return res.sendFile(path.join(__dirname, "public/app.html"));
});

app.get('/currentUser', checkLoggedIn, (req, res) => {
    return res.json([req.session.userid, req.session.username]);
});

// ─── FJELL OG OMRÅDER ─────────────────────────────────────────────────────────

app.get('/omraader', checkLoggedIn, (req, res) => {
    const sql = db.prepare('SELECT * FROM omraade ORDER BY navn');
    return res.json(sql.all());
});

app.post('/omraader', checkLoggedIn, (req, res) => {
    const { navn, beskrivelse } = req.body;
    if (!navn) return res.status(400).json({ error: 'Navn er påkrevd' });
    const info = db.prepare('INSERT INTO omraade (navn, beskrivelse) VALUES (?, ?)').run(navn, beskrivelse || '');
    return res.json({ success: true, id: info.lastInsertRowid });
});

app.get('/fjell', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT fjell.id, fjellnavn, hoyde, fjell.beskrivelse, omraade_id, foto,
               omraade.navn AS omraade
        FROM fjell
        INNER JOIN omraade ON fjell.omraade_id = omraade.id
        ORDER BY omraade.navn, fjellnavn
    `);
    return res.json(sql.all());
});

app.post('/fjell', checkLoggedIn, (req, res) => {
    const { navn, hoyde, omraade_id, beskrivelse, foto } = req.body;
    if (!navn || !hoyde || !omraade_id) {
        return res.status(400).json({ error: 'Fjellnavn, høyde og område er påkrevd' });
    }
    const info = db.prepare(
        'INSERT INTO fjell (fjellnavn, hoyde, beskrivelse, omraade_id, foto) VALUES (?, ?, ?, ?, ?)'
    ).run(navn, hoyde, beskrivelse || '', omraade_id, foto || '');
    return res.json({ success: true, id: info.lastInsertRowid });
});

// ─── TURER ────────────────────────────────────────────────────────────────────

app.get('/fjellturer', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT fjelltur.id, fjell.id AS fjell_id,
               tidspunkt, varighet, fjellnavn, hoyde,
               fjelltur.beskrivelse AS turbeskrivelse,
               omraade.navn AS omraade,
               fjell.beskrivelse AS fjellbeskrivelse,
               fjell.foto
        FROM fjelltur
        INNER JOIN fjell   ON fjelltur.idFjell  = fjell.id
        INNER JOIN omraade ON fjell.omraade_id  = omraade.id
        WHERE fjelltur.idPerson = ?
        ORDER BY tidspunkt DESC
    `);
    // FIX: fjell.id AS fjell_id var manglende — dette er grunnen til at
    // "Logg ny tur her"-knappen sendte fjell_id: null og fikk 400 tilbake
    return res.json(sql.all(req.session.userid));
});

app.post('/fjellturer', checkLoggedIn, (req, res) => {
    const { fjell_id, dato, varighet, beskrivelse } = req.body;
    if (!fjell_id || !dato) {
        return res.status(400).json({ error: 'Fjell og dato er påkrevd' });
    }
    const info = db.prepare(
        'INSERT INTO fjelltur (tidspunkt, varighet, beskrivelse, idFjell, idPerson) VALUES (?, ?, ?, ?, ?)'
    ).run(dato, varighet || null, beskrivelse || '', fjell_id, req.session.userid);
    return res.json({ success: true, id: info.lastInsertRowid });
});

// Rediger tur
app.put('/fjellturer/:id', checkLoggedIn, (req, res) => {
    const { fjell_id, dato, varighet, beskrivelse } = req.body;
    if (!fjell_id || !dato) {
        return res.status(400).json({ error: 'Fjell og dato er påkrevd' });
    }
    const info = db.prepare(
        'UPDATE fjelltur SET tidspunkt=?, varighet=?, beskrivelse=?, idFjell=? WHERE id=? AND idPerson=?'
    ).run(dato, varighet || null, beskrivelse || '', fjell_id, req.params.id, req.session.userid);
    if (info.changes === 0) return res.status(404).json({ error: 'Tur ikke funnet' });
    return res.json({ success: true });
});

// Slett tur
app.delete('/fjellturer/:id', checkLoggedIn, (req, res) => {
    const info = db.prepare('DELETE FROM fjelltur WHERE id=? AND idPerson=?').run(req.params.id, req.session.userid);
    if (info.changes === 0) return res.status(404).json({ error: 'Tur ikke funnet' });
    return res.json({ success: true });
});

// Rediger fjell
app.put('/fjell/:id', checkLoggedIn, (req, res) => {
    const { navn, hoyde, omraade_id, beskrivelse, foto } = req.body;
    if (!navn || !hoyde || !omraade_id) {
        return res.status(400).json({ error: 'Fjellnavn, høyde og område er påkrevd' });
    }
    const info = db.prepare(
        'UPDATE fjell SET fjellnavn=?, hoyde=?, beskrivelse=?, omraade_id=?, foto=? WHERE id=?'
    ).run(navn, hoyde, beskrivelse || '', omraade_id, foto || '', req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Fjell ikke funnet' });
    return res.json({ success: true });
});

// Slett fjell (kun hvis ingen turer er knyttet til det)
app.delete('/fjell/:id', checkLoggedIn, (req, res) => {
    const harTurer = db.prepare('SELECT COUNT(*) AS n FROM fjelltur WHERE idFjell=?').get(req.params.id);
    if (harTurer.n > 0) return res.status(409).json({ error: 'Kan ikke slette fjell med registrerte turer' });
    const info = db.prepare('DELETE FROM fjell WHERE id=?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Fjell ikke funnet' });
    return res.json({ success: true });
});

// Slett venn
app.delete('/venner/:id', checkLoggedIn, (req, res) => {
    const info = db.prepare(
        'DELETE FROM venner WHERE id=? AND (bruker_id=? OR venn_id=?)'
    ).run(req.params.id, req.session.userid, req.session.userid);
    if (info.changes === 0) return res.status(404).json({ error: 'Vennskap ikke funnet' });
    return res.json({ success: true });
});

// Hent aksepterte venner med relasjons-id (for sletting)
app.get('/venner/med-id', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT v.id AS relasjon_id, p.id, p.brukernavn FROM venner v
        INNER JOIN person p ON (
            CASE WHEN v.bruker_id = ? THEN v.venn_id ELSE v.bruker_id END = p.id
        )
        WHERE (v.bruker_id = ? OR v.venn_id = ?) AND v.status = 'akseptert'
    `);
    return res.json(sql.all(req.session.userid, req.session.userid, req.session.userid));
});

// ─── VENNER ───────────────────────────────────────────────────────────────────

// Søk etter andre brukere (unntatt seg selv)
app.get('/brukere', checkLoggedIn, (req, res) => {
    const search = req.query.search || '';
    const sql = db.prepare(`
        SELECT id, brukernavn FROM person
        WHERE id != ? AND brukernavn LIKE ?
        LIMIT 20
    `);
    return res.json(sql.all(req.session.userid, `%${search}%`));
});

// Hent aksepterte venner
app.get('/venner', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT p.id, p.brukernavn FROM venner v
        INNER JOIN person p ON (
            CASE WHEN v.bruker_id = ? THEN v.venn_id ELSE v.bruker_id END = p.id
        )
        WHERE (v.bruker_id = ? OR v.venn_id = ?) AND v.status = 'akseptert'
    `);
    return res.json(sql.all(req.session.userid, req.session.userid, req.session.userid));
});

// Hent innkommende venneforespørsler
app.get('/venneforesporsler', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT v.id AS foresporsel_id, p.id, p.brukernavn FROM venner v
        INNER JOIN person p ON v.bruker_id = p.id
        WHERE v.venn_id = ? AND v.status = 'venter'
    `);
    return res.json(sql.all(req.session.userid));
});

// Send venneforespørsel
app.post('/venner/send', checkLoggedIn, (req, res) => {
    const { venn_id } = req.body;
    if (!venn_id || venn_id == req.session.userid) {
        return res.status(400).json({ error: 'Ugyldig forespørsel' });
    }
    const existing = db.prepare(`
        SELECT * FROM venner
        WHERE (bruker_id = ? AND venn_id = ?) OR (bruker_id = ? AND venn_id = ?)
    `).get(req.session.userid, venn_id, venn_id, req.session.userid);

    if (existing) {
        return res.json({ success: false, error: 'Forespørsel finnes allerede' });
    }
    db.prepare("INSERT INTO venner (bruker_id, venn_id, status) VALUES (?, ?, 'venter')").run(req.session.userid, venn_id);
    return res.json({ success: true });
});

// Aksepter venneforespørsel
app.post('/venner/aksepter', checkLoggedIn, (req, res) => {
    const { foresporsel_id } = req.body;
    db.prepare(`UPDATE venner SET status = 'akseptert' WHERE id = ? AND venn_id = ?`).run(foresporsel_id, req.session.userid);
    return res.json({ success: true });
});

// Avvis / slett venneforespørsel
app.post('/venner/avvis', checkLoggedIn, (req, res) => {
    const { foresporsel_id } = req.body;
    db.prepare(`DELETE FROM venner WHERE id = ? AND venn_id = ?`).run(foresporsel_id, req.session.userid);
    return res.json({ success: true });
});

// Hent turer fra aksepterte venner
app.get('/venner/turer', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT p.brukernavn AS hvem, tidspunkt, varighet, fjellnavn, hoyde,
               fjelltur.beskrivelse AS turbeskrivelse,
               omraade.navn AS omraade,
               fjell.beskrivelse AS fjellbeskrivelse,
               fjell.foto
        FROM fjelltur
        INNER JOIN person p  ON fjelltur.idPerson   = p.id
        INNER JOIN fjell     ON fjelltur.idFjell     = fjell.id
        INNER JOIN omraade   ON fjell.omraade_id     = omraade.id
        WHERE fjelltur.idPerson IN (
            SELECT CASE WHEN bruker_id = ? THEN venn_id ELSE bruker_id END
            FROM venner
            WHERE (bruker_id = ? OR venn_id = ?) AND status = 'akseptert'
        )
        ORDER BY tidspunkt DESC
    `);
    return res.json(sql.all(req.session.userid, req.session.userid, req.session.userid));
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(3000, () => {
    console.log("Server kjører på http://localhost:3000");
});
