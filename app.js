
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const sqlite3 = require('better-sqlite3')
const db = sqlite3('./fjelltur.db', {verbose: console.log})
const session = require('express-session')
const dotenv = require('dotenv');

dotenv.config()

const saltRounds = 10
const app = express()
const staticPath = path.join(__dirname, 'public')

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

app.use(express.static(staticPath));

app.post('/login', (req, res) => {
    try {
        let user = checkUserPassword(req.body.username, req.body.password)
        if (user != null) {
            req.session.loggedIn = true
            req.session.username = req.body.username
            req.session.userid = user.brukerid
            res.redirect('/');
        }
        if (user == null || !req.session.loggedIn) {
            res.json(null);
        }
    } catch (error) {
        console.error(error);
        res.json(null);
    }
})

app.post('/register', (req, res) => {
    const reguser = req.body;
    const user = addUser(reguser.username, reguser.password, reguser.email)
    if (user) {
        req.session.loggedIn = true
        req.session.username = user.brukernavn
        req.session.userid = user.brukerid
        if (req.session.loggedIn) {
            return res.send(true)
        }
    }
    res.send(false)
});

function checkUserPassword(username, password) {
    const sql = db.prepare('SELECT id as brukerid, brukernavn, passord FROM person WHERE brukernavn = ?');
    let user = sql.get(username);
    if (user && bcrypt.compareSync(password, user.passord)) {
        return user
    } else {
        return null;
    }
}

function checkLoggedIn(req, res, next) {
    if (!req.session.loggedIn) {
        return res.sendFile(path.join(__dirname, "public/login.html"));
    } else {
        next();
    }
}

app.get('/logout', (req, res) => {
    req.session.destroy()
    return res.sendFile(path.join(__dirname, "public/login.html"));
})

function addUser(username, password, email) {
    const hash = bcrypt.hashSync(password, saltRounds)
    let sql = db.prepare("INSERT INTO person (brukernavn, passord, epost) values (?, ?, ?)")
    const info = sql.run(username, hash, email)
    sql = db.prepare('SELECT person.id as brukerid, brukernavn FROM person WHERE person.id = ?');
    let rows = sql.all(info.lastInsertRowid)
    return rows[0]
}

app.get('/currentUser', checkLoggedIn, (req, res) => {
    return res.send([req.session.userid, req.session.username, req.session.userrole]);
});

app.get('/', checkLoggedIn, (req, res) => {
    return res.sendFile(path.join(__dirname, "public/app.html"));
});

app.get('/omraader', checkLoggedIn, (req, res) => {
    const sql = db.prepare('SELECT * FROM omraade')
    return res.json(sql.all())
})


// Hent alle fjell (for nedtrekksliste)
app.get('/fjell', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT fjell.id, fjellnavn, hoyde, fjell.beskrivelse, omraade_id, foto, omraade.navn as omraade
        FROM fjell
        INNER JOIN omraade ON fjell.omraade_id = omraade.id
        ORDER BY omraade.navn, fjellnavn
    `)
    return res.json(sql.all())
})

// Logg ny tur (POST)
app.post('/fjellturer', checkLoggedIn, (req, res) => {
    const { fjell_id, dato, varighet, beskrivelse } = req.body
    if (!fjell_id || !dato) {
        return res.status(400).json({ error: 'Fjell og dato er påkrevd' })
    }
    const sql = db.prepare(
        'INSERT INTO fjelltur (tidspunkt, varighet, beskrivelse, idFjell, idPerson) VALUES (?, ?, ?, ?, ?)'
    )
    const info = sql.run(dato, varighet || null, beskrivelse || '', fjell_id, req.session.userid)
    return res.json({ success: true, id: info.lastInsertRowid })
})

app.get('/fjellturer', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT DISTINCT tidspunkt, fjellnavn, hoyde, fjelltur.beskrivelse as turbeskrivelse,
            omraade.navn as omraade, fjell.beskrivelse as fjellbeskrivelse, fjell.foto
        FROM fjelltur
        INNER JOIN person ON fjelltur.idPerson = person.id
        INNER JOIN fjell ON fjelltur.idFjell = fjell.id
        INNER JOIN omraade ON fjell.omraade_id = omraade.id
        LEFT OUTER JOIN bilde ON fjelltur.id = bilde.tur_id
        WHERE person.id = ?
        ORDER BY tidspunkt DESC
    `)
    return res.json(sql.all(req.session.userid))
})

// ─── VENNER ──────────────────────────────────────────────────────────────────

// Søk etter brukere
app.get('/brukere', checkLoggedIn, (req, res) => {
    const search = req.query.search || ''
    const sql = db.prepare(`
        SELECT id, brukernavn FROM person
        WHERE id != ? AND brukernavn LIKE ?
        LIMIT 20
    `)
    return res.json(sql.all(req.session.userid, `%${search}%`))
})

// Hent aksepterte venner
app.get('/venner', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT p.id, p.brukernavn FROM venner v
        INNER JOIN person p ON (
            CASE WHEN v.bruker_id = ? THEN v.venn_id ELSE v.bruker_id END = p.id
        )
        WHERE (v.bruker_id = ? OR v.venn_id = ?) AND v.status = 'akseptert'
    `)
    return res.json(sql.all(req.session.userid, req.session.userid, req.session.userid))
})

// Hent innkommende forespørsler
app.get('/venneforesporsler', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT v.id as foresporsel_id, p.id, p.brukernavn FROM venner v
        INNER JOIN person p ON v.bruker_id = p.id
        WHERE v.venn_id = ? AND v.status = 'venter'
    `)
    return res.json(sql.all(req.session.userid))
})

// Send venneforespørsel
app.post('/venner/send', checkLoggedIn, (req, res) => {
    const { venn_id } = req.body
    if (!venn_id || venn_id == req.session.userid) {
        return res.status(400).json({ error: 'Ugyldig forespørsel' })
    }
    const existing = db.prepare(`
        SELECT * FROM venner WHERE
        (bruker_id = ? AND venn_id = ?) OR (bruker_id = ? AND venn_id = ?)
    `).get(req.session.userid, venn_id, venn_id, req.session.userid)

    if (existing) {
        return res.status(400).json({ error: 'Forespørsel finnes allerede' })
    }
    db.prepare("INSERT INTO venner (bruker_id, venn_id, status) VALUES (?, ?, 'venter')").run(req.session.userid, venn_id)
    return res.json({ success: true })
})

// Aksepter forespørsel
app.post('/venner/aksepter', checkLoggedIn, (req, res) => {
    const { foresporsel_id } = req.body
    db.prepare(`UPDATE venner SET status = 'akseptert' WHERE id = ? AND venn_id = ?`).run(foresporsel_id, req.session.userid)
    return res.json({ success: true })
})

// Avvis forespørsel
app.post('/venner/avvis', checkLoggedIn, (req, res) => {
    const { foresporsel_id } = req.body
    db.prepare(`DELETE FROM venner WHERE id = ? AND venn_id = ?`).run(foresporsel_id, req.session.userid)
    return res.json({ success: true })
})

// Hent venners turer
app.get('/venner/turer', checkLoggedIn, (req, res) => {
    const sql = db.prepare(`
        SELECT DISTINCT p.brukernavn as hvem, tidspunkt, fjellnavn, hoyde,
            fjelltur.beskrivelse as turbeskrivelse,
            omraade.navn as omraade, fjell.beskrivelse as fjellbeskrivelse, fjell.foto
        FROM fjelltur
        INNER JOIN person p ON fjelltur.idPerson = p.id
        INNER JOIN fjell ON fjelltur.idFjell = fjell.id
        INNER JOIN omraade ON fjell.omraade_id = omraade.id
        LEFT OUTER JOIN bilde ON fjelltur.id = bilde.tur_id
        WHERE fjelltur.idPerson IN (
            SELECT CASE WHEN bruker_id = ? THEN venn_id ELSE bruker_id END
            FROM venner
            WHERE (bruker_id = ? OR venn_id = ?) AND status = 'akseptert'
        )
        ORDER BY tidspunkt DESC
    `)
    return res.json(sql.all(req.session.userid, req.session.userid, req.session.userid))
})



// Legg til nytt område
app.post('/omraader', checkLoggedIn, (req, res) => {
    const { navn, beskrivelse } = req.body
    if (!navn) return res.status(400).json({ error: 'Navn er påkrevd' })
    const sql = db.prepare('INSERT INTO omraade (navn, beskrivelse) VALUES (?, ?)')
    const info = sql.run(navn, beskrivelse || '')
    return res.json({ success: true, id: info.lastInsertRowid })
})

// Legg til nytt fjell
app.post('/fjell', checkLoggedIn, (req, res) => {
    const { navn, hoyde, omraade_id, beskrivelse, foto } = req.body
    if (!navn || !hoyde || !omraade_id) {
        return res.status(400).json({ error: 'Mangler påkrevde felt' })
    }
    const sql = db.prepare(
        'INSERT INTO fjell (fjellnavn, hoyde, beskrivelse, omraade_id, foto) VALUES (?, ?, ?, ?, ?)'
    )
    const info = sql.run(navn, hoyde, beskrivelse || '', omraade_id, foto || '')
    return res.json({ success: true, id: info.lastInsertRowid })
})

app.use(express.static(staticPath));

app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});
