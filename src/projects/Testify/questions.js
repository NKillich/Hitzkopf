// Testify: Fragenkatalog (erste Testfassung – wird später überarbeitet).
// Jede Frage: id, sets (freunde/paar), cat (Kategorie), type:
//   pick4 – own/other: Frage an dich / über den anderen ({n} = Name), options: 4 Antworten
//   pair  – own: Frage, options: 2 × { label, icon } (beide Schritte auf einem Bildschirm)
//   scale – own/other, labels: 5 Beschriftungen für 1–5 (Ränder = labels[0] und labels[4])
// Formulierungen bewusst neutral (kein Gendern nötig: „Früh aufstehen“ statt „Frühaufsteherin“).

export const CATEGORIES = {
    musik: 'Musik',
    reisen: 'Reisen',
    alltag: 'Alltag',
    essen: 'Essen',
    persoenlichkeit: 'Persönlichkeit',
    liebe: 'Liebe',
}

export const SETS = {
    freunde: { label: 'Freunde', sub: 'Für Kumpels & Crew' },
    paar: { label: 'Paar', sub: 'Für euch zwei' },
}

const F = ['freunde', 'paar']   // passt zu beiden Sets
const FR = ['freunde']
const PA = ['paar']

export const QUESTIONS = [
    // ── Musik ──────────────────────────────────────────────────────────────
    { id: 'mu1', sets: F, cat: 'musik', type: 'pick4', own: 'Welche dieser Bands würdest du am ehesten live sehen?', other: 'Welche dieser Bands würde {n} am ehesten live sehen?', options: ['Linkin Park', 'Foo Fighters', 'Die Ärzte', 'Coldplay'] },
    { id: 'mu2', sets: F, cat: 'musik', type: 'pick4', own: 'Welches Festival reizt dich am meisten?', other: 'Welches Festival reizt {n} am meisten?', options: ['Rock am Ring', 'Parookaville', 'Tomorrowland', 'Wacken'] },
    { id: 'mu3', sets: F, cat: 'musik', type: 'pick4', own: 'Was läuft bei dir im Auto am ehesten?', other: 'Was läuft bei {n} im Auto am ehesten?', options: ['Charts', 'Deutschrap', 'Rock', 'Podcast'] },
    { id: 'mu4', sets: F, cat: 'musik', type: 'pair', own: 'Karaoke oder lieber zuhören?', options: [{ label: 'Karaoke', icon: '🎤' }, { label: 'Zuhören', icon: '🎧' }] },
    { id: 'mu5', sets: F, cat: 'musik', type: 'scale', own: 'Wie laut drehst du deine Lieblingsmusik auf?', other: 'Wie laut dreht {n} die Lieblingsmusik auf?', labels: ['Eher leise', 'Gemütlich', 'Normal', 'Ordentlich laut', 'Nachbarn wecken'] },
    { id: 'mu6', sets: F, cat: 'musik', type: 'pick4', own: 'Welches Jahrzehnt hat für dich die beste Musik?', other: 'Welches Jahrzehnt hat für {n} die beste Musik?', options: ['80er', '90er', '2000er', 'Heute'] },
    { id: 'mu7', sets: F, cat: 'musik', type: 'pair', own: 'Konzert oder Club?', options: [{ label: 'Konzert', icon: '🎸' }, { label: 'Club', icon: '🪩' }] },

    // ── Reisen ─────────────────────────────────────────────────────────────
    { id: 're1', sets: F, cat: 'reisen', type: 'pair', own: 'Strand oder Berge?', options: [{ label: 'Strand', icon: '🏖️' }, { label: 'Berge', icon: '⛰️' }] },
    { id: 're2', sets: F, cat: 'reisen', type: 'pick4', own: 'Wohin würdest du sofort reisen?', other: 'Wohin würde {n} sofort reisen?', options: ['Japan', 'New York', 'Island', 'Bali'] },
    { id: 're3', sets: F, cat: 'reisen', type: 'pair', own: 'Städtetrip oder Natur?', options: [{ label: 'Städtetrip', icon: '🏙️' }, { label: 'Natur', icon: '🌲' }] },
    { id: 're4', sets: F, cat: 'reisen', type: 'scale', own: 'Wie spontan planst du deinen Urlaub?', other: 'Wie spontan plant {n} den Urlaub?', labels: ['Alles durchgeplant', 'Grob geplant', 'Halb-halb', 'Eher spontan', 'Last Minute'] },
    { id: 're5', sets: F, cat: 'reisen', type: 'pick4', own: 'Wie reist du am liebsten?', other: 'Wie reist {n} am liebsten?', options: ['Flugzeug', 'Auto', 'Zug', 'Wohnmobil'] },
    { id: 're6', sets: F, cat: 'reisen', type: 'pair', own: 'Hotel oder Zelt?', options: [{ label: 'Hotel', icon: '🏨' }, { label: 'Zelt', icon: '⛺' }] },
    { id: 're7', sets: F, cat: 'reisen', type: 'pick4', own: 'Was darf im Urlaub auf keinen Fall fehlen?', other: 'Was darf im Urlaub bei {n} auf keinen Fall fehlen?', options: ['Gutes Essen', 'Sonne', 'Abenteuer', 'Ausschlafen'] },

    // ── Alltag ─────────────────────────────────────────────────────────────
    { id: 'al1', sets: F, cat: 'alltag', type: 'scale', own: 'Wie gern gehst du am Wochenende feiern?', other: 'Wie gern geht {n} am Wochenende feiern?', labels: ['Lieber Sofa', 'Selten', 'Ab und zu', 'Sehr gern', 'Bis zum Morgen'] },
    { id: 'al2', sets: F, cat: 'alltag', type: 'pick4', own: 'Wie verbringst du am liebsten einen freien Sonntag?', other: 'Wie verbringt {n} am liebsten einen freien Sonntag?', options: ['Ausschlafen', 'Sport', 'Freunde treffen', 'Serien schauen'] },
    { id: 'al3', sets: F, cat: 'alltag', type: 'pair', own: 'Hund oder Katze?', options: [{ label: 'Hund', icon: '🐶' }, { label: 'Katze', icon: '🐱' }] },
    { id: 'al4', sets: F, cat: 'alltag', type: 'scale', own: 'Wie ordentlich ist dein Zimmer gerade?', other: 'Wie ordentlich ist das Zimmer von {n} gerade?', labels: ['Chaos pur', 'Unordentlich', 'Geht so', 'Ziemlich ordentlich', 'Wie im Katalog'] },
    { id: 'al5', sets: F, cat: 'alltag', type: 'pick4', own: 'Welche Serie würdest du sofort nochmal schauen?', other: 'Welche Serie würde {n} sofort nochmal schauen?', options: ['Breaking Bad', 'Friends', 'Stranger Things', 'Game of Thrones'] },
    { id: 'al6', sets: F, cat: 'alltag', type: 'pair', own: 'Duschen morgens oder abends?', options: [{ label: 'Morgens', icon: '🌅' }, { label: 'Abends', icon: '🌙' }] },
    { id: 'al7', sets: F, cat: 'alltag', type: 'scale', own: 'Wie oft schaust du am Tag aufs Handy?', other: 'Wie oft schaut {n} am Tag aufs Handy?', labels: ['Kaum', 'Ab und zu', 'Normal', 'Ständig', 'Handy klebt an der Hand'] },
    { id: 'al8', sets: FR, cat: 'alltag', type: 'pick4', own: 'Was machst du am ehesten bei einer Gruppenreise?', other: 'Was macht {n} am ehesten bei einer Gruppenreise?', options: ['Alles planen', 'Fahren', 'Für Stimmung sorgen', 'Mitlaufen'] },

    // ── Essen ──────────────────────────────────────────────────────────────
    { id: 'es1', sets: F, cat: 'essen', type: 'pick4', own: 'Was bestellst du dir am ehesten?', other: 'Was bestellt sich {n} am ehesten?', options: ['Pizza', 'Sushi', 'Burger', 'Döner'] },
    { id: 'es2', sets: F, cat: 'essen', type: 'pair', own: 'Süß oder salzig?', options: [{ label: 'Süß', icon: '🍫' }, { label: 'Salzig', icon: '🥨' }] },
    { id: 'es3', sets: F, cat: 'essen', type: 'scale', own: 'Wie scharf isst du gern?', other: 'Wie scharf isst {n} gern?', labels: ['Gar nicht', 'Ein bisschen', 'Mittel', 'Scharf', 'Feuer frei'] },
    { id: 'es4', sets: F, cat: 'essen', type: 'pair', own: 'Kaffee oder Tee?', options: [{ label: 'Kaffee', icon: '☕' }, { label: 'Tee', icon: '🍵' }] },
    { id: 'es5', sets: F, cat: 'essen', type: 'pick4', own: 'Welches Frühstück passt am besten zu dir?', other: 'Welches Frühstück passt am besten zu {n}?', options: ['Brötchen', 'Müsli', 'Rührei', 'Nur Kaffee'] },
    { id: 'es6', sets: F, cat: 'essen', type: 'scale', own: 'Wie gern kochst du selbst?', other: 'Wie gern kocht {n} selbst?', labels: ['Nie', 'Wenn es sein muss', 'Ab und zu', 'Gern', 'Leidenschaft'] },
    { id: 'es7', sets: F, cat: 'essen', type: 'pick4', own: 'Welche Küche würdest du am ehesten wählen?', other: 'Welche Küche würde {n} am ehesten wählen?', options: ['Italienisch', 'Asiatisch', 'Mexikanisch', 'Deutsch'] },

    // ── Persönlichkeit ─────────────────────────────────────────────────────
    { id: 'pe1', sets: F, cat: 'persoenlichkeit', type: 'pair', own: 'Früh aufstehen oder spät aufstehen?', options: [{ label: 'Früh aufstehen', icon: '🐓' }, { label: 'Spät aufstehen', icon: '🦉' }] },
    { id: 'pe2', sets: F, cat: 'persoenlichkeit', type: 'scale', own: 'Wie gut kannst du ein Geheimnis für dich behalten?', other: 'Wie gut kann {n} ein Geheimnis für sich behalten?', labels: ['Gar nicht', 'Eher schlecht', 'Geht so', 'Gut', 'Wie ein Tresor'] },
    { id: 'pe3', sets: F, cat: 'persoenlichkeit', type: 'pick4', own: 'Welche Superkraft hättest du am liebsten?', other: 'Welche Superkraft hätte {n} am liebsten?', options: ['Fliegen', 'Unsichtbar sein', 'Gedanken lesen', 'Zeitreisen'] },
    { id: 'pe4', sets: F, cat: 'persoenlichkeit', type: 'pair', own: 'Planen oder spontan?', options: [{ label: 'Planen', icon: '📋' }, { label: 'Spontan', icon: '🎲' }] },
    { id: 'pe5', sets: F, cat: 'persoenlichkeit', type: 'scale', own: 'Wie schnell bist du genervt?', other: 'Wie schnell ist {n} genervt?', labels: ['Die Ruhe selbst', 'Entspannt', 'Normal', 'Recht schnell', 'Kurze Zündschnur'] },
    { id: 'pe6', sets: F, cat: 'persoenlichkeit', type: 'pick4', own: 'Was wärst du in einem Film am ehesten?', other: 'Was wäre {n} in einem Film am ehesten?', options: ['Held', 'Bösewicht', 'Sidekick', 'Comic-Relief'] },
    { id: 'pe7', sets: F, cat: 'persoenlichkeit', type: 'pair', own: 'Lieber reden oder zuhören?', options: [{ label: 'Reden', icon: '🗣️' }, { label: 'Zuhören', icon: '👂' }] },
    { id: 'pe8', sets: F, cat: 'persoenlichkeit', type: 'scale', own: 'Wie risikofreudig bist du?', other: 'Wie risikofreudig ist {n}?', labels: ['Safety first', 'Vorsichtig', 'Mittel', 'Mutig', 'Kein Limit'] },
    { id: 'pe9', sets: FR, cat: 'persoenlichkeit', type: 'pick4', own: 'Welche Rolle hast du in der Freundesgruppe?', other: 'Welche Rolle hat {n} in der Freundesgruppe?', options: ['Organisator', 'Spaßvogel', 'Ruhepol', 'Ratgeber'] },

    // ── Liebe (nur Paar) ───────────────────────────────────────────────────
    { id: 'li1', sets: PA, cat: 'liebe', type: 'pick4', own: 'Was ist für dich das perfekte Date?', other: 'Was ist für {n} das perfekte Date?', options: ['Candle-Light-Dinner', 'Kino', 'Ausflug ins Grüne', 'Kochen zuhause'] },
    { id: 'li2', sets: PA, cat: 'liebe', type: 'scale', own: 'Wie romantisch bist du?', other: 'Wie romantisch ist {n}?', labels: ['Gar nicht', 'Ein bisschen', 'Mittel', 'Sehr', 'Hoffnungslos romantisch'] },
    { id: 'li3', sets: PA, cat: 'liebe', type: 'pair', own: 'Kuscheln oder Freiraum?', options: [{ label: 'Kuscheln', icon: '🤗' }, { label: 'Freiraum', icon: '🕊️' }] },
    { id: 'li4', sets: PA, cat: 'liebe', type: 'pick4', own: 'Womit zeigst du am ehesten Zuneigung?', other: 'Womit zeigt {n} am ehesten Zuneigung?', options: ['Worte', 'Geschenke', 'Zeit zusammen', 'Berührung'] },
    { id: 'li5', sets: PA, cat: 'liebe', type: 'scale', own: 'Wie eifersüchtig bist du?', other: 'Wie eifersüchtig ist {n}?', labels: ['Gar nicht', 'Kaum', 'Normal', 'Schon etwas', 'Sehr'] },
    { id: 'li6', sets: PA, cat: 'liebe', type: 'pair', own: 'Jahrestag feiern oder egal?', options: [{ label: 'Feiern', icon: '🥂' }, { label: 'Egal', icon: '🤷' }] },
    { id: 'li7', sets: PA, cat: 'liebe', type: 'pick4', own: 'Was nervt dich im Haushalt am meisten?', other: 'Was nervt {n} im Haushalt am meisten?', options: ['Abwaschen', 'Wäsche', 'Putzen', 'Einkaufen'] },
    { id: 'li8', sets: PA, cat: 'liebe', type: 'scale', own: 'Wie gern planst du Überraschungen?', other: 'Wie gern plant {n} Überraschungen?', labels: ['Nie', 'Selten', 'Ab und zu', 'Gern', 'Ständig'] },
    { id: 'li9', sets: PA, cat: 'liebe', type: 'pair', own: 'Zusammen kochen oder essen gehen?', options: [{ label: 'Kochen', icon: '🍳' }, { label: 'Essen gehen', icon: '🍽️' }] },
]
