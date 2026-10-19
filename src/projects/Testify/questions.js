// Testify: Fragenkatalog (erste Testfassung – wird später überarbeitet).
// Jede Frage: id, sets (freunde/paar), cat (Kategorie), type:
//   pick4 – own/other: Frage an dich / über den anderen ({n} = Name), options: 4 Antworten
//   pair  – own: Frage, options: 2 × { label, icon } (beide Schritte auf einem Bildschirm)
//   scale – own/other, labels: 5 Beschriftungen für 1–5 (Ränder = labels[0] und labels[4])
//   emoji4 – Bildwahl: own/other, options: 4 × { label, icon } (große Kacheln 2 × 2)
//   yesno – Schon mal …?: own: Frage (Ja/Nein fest, beide Schritte auf einem Bildschirm)
//   who   – Wer von uns?: own: Frage an beide; Antwort „Ich“ oder der andere, kein Tipp (zählt nur gemeinsam)
// Formulierungen bewusst neutral (kein Gendern nötig: „Früh aufstehen“ statt „Frühaufsteherin“).

export const CATEGORIES = {
    musik: 'Musik',
    reisen: 'Reisen',
    alltag: 'Alltag',
    essen: 'Essen',
    persoenlichkeit: 'Persönlichkeit',
    liebe: 'Liebe',
    kindheit: 'Kindheit',
    waswaere: 'Was wäre wenn',
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

    // ── Neu: Eins aus 4 ────────────────────────────────────────────────────
    { id: 'kh1', sets: F, cat: 'kindheit', type: 'pick4', own: 'Was wolltest du als Kind am ehesten werden?', other: 'Was wollte {n} als Kind am ehesten werden?', options: ['Polizei', 'Tierarzt', 'Astronaut', 'Fußballprofi'] },
    { id: 'kh2', sets: F, cat: 'kindheit', type: 'pick4', own: 'Welche Süßigkeit war als Kind dein Favorit?', other: 'Welche Süßigkeit war als Kind der Favorit von {n}?', options: ['Gummibärchen', 'Schokolade', 'Brausepulver', 'Lutscher'] },
    { id: 'kh3', sets: F, cat: 'kindheit', type: 'pick4', own: 'Was hast du als Kind am liebsten gespielt?', other: 'Was hat {n} als Kind am liebsten gespielt?', options: ['Lego', 'Draußen toben', 'Videospiele', 'Brettspiele'] },
    { id: 'ww1', sets: F, cat: 'waswaere', type: 'pick4', own: 'Du gewinnst eine Million – was machst du zuerst?', other: '{n} gewinnt eine Million – was passiert zuerst?', options: ['Weltreise', 'Haus kaufen', 'Sparen', 'Party für alle'] },
    { id: 'ww2', sets: F, cat: 'waswaere', type: 'pick4', own: 'Du darfst ein Jahr in einer anderen Zeit leben – welche?', other: '{n} darf ein Jahr in einer anderen Zeit leben – welche?', options: ['Steinzeit', 'Mittelalter', '80er', 'Zukunft'] },
    { id: 'ww3', sets: F, cat: 'waswaere', type: 'pick4', own: 'Zombie-Apokalypse: Was ist deine Rolle?', other: 'Zombie-Apokalypse: Was ist die Rolle von {n}?', options: ['Anführer', 'Koch', 'Erste, die es erwischt', 'Einzelkämpfer'] },
    { id: 'al9', sets: F, cat: 'alltag', type: 'pick4', own: 'Was machst du als Erstes nach dem Aufwachen?', other: 'Was macht {n} als Erstes nach dem Aufwachen?', options: ['Handy checken', 'Kaffee', 'Duschen', 'Snoozen'] },
    { id: 're8', sets: F, cat: 'reisen', type: 'pick4', own: 'Was nervt dich im Urlaub am meisten?', other: 'Was nervt {n} im Urlaub am meisten?', options: ['Hitze', 'Touristen', 'Schlechtes Essen', 'Mücken'] },
    { id: 'es8', sets: F, cat: 'essen', type: 'pick4', own: 'Was darf auf deiner Pizza nie fehlen?', other: 'Was darf auf der Pizza von {n} nie fehlen?', options: ['Salami', 'Pilze', 'Ananas', 'Extra Käse'] },
    { id: 'pe10', sets: F, cat: 'persoenlichkeit', type: 'pick4', own: 'Wie reagierst du auf Streit?', other: 'Wie reagiert {n} auf Streit?', options: ['Sofort klären', 'Erst mal Ruhe', 'Witz machen', 'Laut werden'] },

    // ── Neu: Dies oder das ─────────────────────────────────────────────────
    { id: 'ww4', sets: F, cat: 'waswaere', type: 'pair', own: 'Fliegen können oder unsichtbar sein?', options: [{ label: 'Fliegen', icon: '🦅' }, { label: 'Unsichtbar', icon: '👻' }] },
    { id: 'kh4', sets: F, cat: 'kindheit', type: 'pair', own: 'Als Kind: Zeichentrick oder draußen spielen?', options: [{ label: 'Zeichentrick', icon: '📺' }, { label: 'Draußen', icon: '🌳' }] },
    { id: 'al10', sets: F, cat: 'alltag', type: 'pair', own: 'Serie oder Film?', options: [{ label: 'Serie', icon: '🍿' }, { label: 'Film', icon: '🎬' }] },
    { id: 'es9', sets: F, cat: 'essen', type: 'pair', own: 'Pizza oder Pasta?', options: [{ label: 'Pizza', icon: '🍕' }, { label: 'Pasta', icon: '🍝' }] },

    // ── Neu: Skala ─────────────────────────────────────────────────────────
    { id: 'kh5', sets: F, cat: 'kindheit', type: 'scale', own: 'Wie brav warst du als Kind?', other: 'Wie brav war {n} als Kind?', labels: ['Kleiner Teufel', 'Frech', 'Mal so, mal so', 'Ziemlich brav', 'Engel'] },
    { id: 'ww5', sets: F, cat: 'waswaere', type: 'scale', own: 'Wie lange würdest du ohne Handy durchhalten?', other: 'Wie lange würde {n} ohne Handy durchhalten?', labels: ['Eine Stunde', 'Einen Tag', 'Eine Woche', 'Einen Monat', 'Für immer'] },
    { id: 're9', sets: F, cat: 'reisen', type: 'scale', own: 'Wie abenteuerlustig bist du auf Reisen?', other: 'Wie abenteuerlustig ist {n} auf Reisen?', labels: ['All-inclusive', 'Gemütlich', 'Mittel', 'Abenteuer', 'Rucksack ins Ungewisse'] },
    { id: 'mu8', sets: F, cat: 'musik', type: 'scale', own: 'Wie textsicher bist du bei deinen Lieblingsliedern?', other: 'Wie textsicher ist {n} bei den Lieblingsliedern?', labels: ['Nur der Refrain', 'Ein paar Zeilen', 'Meistens', 'Fast alles', 'Jedes Wort'] },

    // ── Neu: Bildwahl (2 × 2) ──────────────────────────────────────────────
    { id: 'bw1', sets: F, cat: 'persoenlichkeit', type: 'emoji4', own: 'Welches Tier passt am besten zu dir?', other: 'Welches Tier passt am besten zu {n}?', options: [{ label: 'Faultier', icon: '🦥' }, { label: 'Fuchs', icon: '🦊' }, { label: 'Löwe', icon: '🦁' }, { label: 'Eule', icon: '🦉' }] },
    { id: 'bw2', sets: F, cat: 'persoenlichkeit', type: 'emoji4', own: 'Welches Wetter ist dein Wetter?', other: 'Welches Wetter ist das Wetter von {n}?', options: [{ label: 'Sonne', icon: '☀️' }, { label: 'Regen', icon: '🌧️' }, { label: 'Schnee', icon: '❄️' }, { label: 'Gewitter', icon: '⛈️' }] },
    { id: 'bw3', sets: F, cat: 'essen', type: 'emoji4', own: 'Welcher Snack beim Filmabend?', other: 'Welchen Snack nimmt {n} beim Filmabend?', options: [{ label: 'Popcorn', icon: '🍿' }, { label: 'Chips', icon: '🥔' }, { label: 'Schokolade', icon: '🍫' }, { label: 'Obst', icon: '🍓' }] },
    { id: 'bw4', sets: F, cat: 'reisen', type: 'emoji4', own: 'Wo würdest du am liebsten übernachten?', other: 'Wo würde {n} am liebsten übernachten?', options: [{ label: 'Baumhaus', icon: '🌳' }, { label: 'Schloss', icon: '🏰' }, { label: 'Iglu', icon: '🧊' }, { label: 'Hausboot', icon: '🛥️' }] },
    { id: 'bw5', sets: F, cat: 'alltag', type: 'emoji4', own: 'Welcher Sport liegt dir am meisten?', other: 'Welcher Sport liegt {n} am meisten?', options: [{ label: 'Fußball', icon: '⚽' }, { label: 'Schwimmen', icon: '🏊' }, { label: 'Fitness', icon: '🏋️' }, { label: 'Couch', icon: '🛋️' }] },
    { id: 'bw6', sets: F, cat: 'essen', type: 'emoji4', own: 'Welches Getränk am Freitagabend?', other: 'Welches Getränk nimmt {n} am Freitagabend?', options: [{ label: 'Bier', icon: '🍺' }, { label: 'Wein', icon: '🍷' }, { label: 'Cocktail', icon: '🍹' }, { label: 'Limo', icon: '🥤' }] },
    { id: 'bw7', sets: F, cat: 'waswaere', type: 'emoji4', own: 'Du darfst ein Fahrzeug geschenkt bekommen – welches?', other: '{n} darf ein Fahrzeug geschenkt bekommen – welches?', options: [{ label: 'Sportwagen', icon: '🏎️' }, { label: 'Motorrad', icon: '🏍️' }, { label: 'Wohnmobil', icon: '🚐' }, { label: 'Segelboot', icon: '⛵' }] },
    { id: 'bw8', sets: F, cat: 'kindheit', type: 'emoji4', own: 'Welches Spielzeug hättest du als Kind am liebsten gehabt?', other: 'Welches Spielzeug hätte {n} als Kind am liebsten gehabt?', options: [{ label: 'Teddy', icon: '🧸' }, { label: 'Spielkonsole', icon: '🎮' }, { label: 'Fahrrad', icon: '🚲' }, { label: 'Baukasten', icon: '🧱' }] },
    { id: 'bw9', sets: F, cat: 'musik', type: 'emoji4', own: 'Welches Instrument würdest du gern spielen?', other: 'Welches Instrument würde {n} gern spielen?', options: [{ label: 'Gitarre', icon: '🎸' }, { label: 'Klavier', icon: '🎹' }, { label: 'Schlagzeug', icon: '🥁' }, { label: 'Saxofon', icon: '🎷' }] },
    { id: 'bw10', sets: F, cat: 'alltag', type: 'emoji4', own: 'Welcher Wochentag ist dein liebster?', other: 'Welcher Wochentag ist der liebste von {n}?', options: [{ label: 'Freitag', icon: '🎉' }, { label: 'Samstag', icon: '🛍️' }, { label: 'Sonntag', icon: '😴' }, { label: 'Mittwoch', icon: '🐫' }] },
    { id: 'bw11', sets: F, cat: 'reisen', type: 'emoji4', own: 'Welche Landschaft macht dich am glücklichsten?', other: 'Welche Landschaft macht {n} am glücklichsten?', options: [{ label: 'Meer', icon: '🌊' }, { label: 'Wald', icon: '🌲' }, { label: 'Wüste', icon: '🏜️' }, { label: 'Großstadt', icon: '🌆' }] },
    { id: 'bw12', sets: F, cat: 'persoenlichkeit', type: 'emoji4', own: 'Welcher Emoji beschreibt dich am besten?', other: 'Welcher Emoji beschreibt {n} am besten?', options: [{ label: 'Lachen', icon: '😂' }, { label: 'Cool', icon: '😎' }, { label: 'Nachdenklich', icon: '🤔' }, { label: 'Verliebt', icon: '😍' }] },

    // ── Neu: Schon mal …? (Ja/Nein) ────────────────────────────────────────
    { id: 'sm1', sets: F, cat: 'alltag', type: 'yesno', own: 'Schon mal eine Nacht komplett durchgemacht?' },
    { id: 'sm2', sets: F, cat: 'reisen', type: 'yesno', own: 'Schon mal einen Flug verpasst?' },
    { id: 'sm3', sets: F, cat: 'essen', type: 'yesno', own: 'Schon mal Insekten gegessen?' },
    { id: 'sm4', sets: F, cat: 'kindheit', type: 'yesno', own: 'Schon mal als Kind von zu Hause „abgehauen“?' },
    { id: 'sm5', sets: F, cat: 'musik', type: 'yesno', own: 'Schon mal auf einer Bühne gestanden?' },
    { id: 'sm6', sets: F, cat: 'persoenlichkeit', type: 'yesno', own: 'Schon mal bei einem Film geweint?' },
    { id: 'sm7', sets: F, cat: 'alltag', type: 'yesno', own: 'Schon mal den eigenen Geburtstag vergessen?' },
    { id: 'sm8', sets: F, cat: 'reisen', type: 'yesno', own: 'Schon mal allein verreist?' },
    { id: 'sm9', sets: F, cat: 'waswaere', type: 'yesno', own: 'Würdest du für ein Jahr auf eine einsame Insel ziehen?' },
    { id: 'sm10', sets: F, cat: 'persoenlichkeit', type: 'yesno', own: 'Schon mal jemanden absichtlich angeschwindelt, um eine Party zu schwänzen?' },
    { id: 'sm11', sets: F, cat: 'essen', type: 'yesno', own: 'Schon mal etwas vom Boden gegessen (5-Sekunden-Regel)?' },
    { id: 'sm12', sets: F, cat: 'alltag', type: 'yesno', own: 'Schon mal in der Öffentlichkeit laut gesungen?' },

    // ── Neu: Wer von uns? (beide antworten, kein Tipp) ─────────────────────
    { id: 'wu1', sets: F, cat: 'alltag', type: 'who', own: 'Wer von euch kommt öfter zu spät?' },
    { id: 'wu2', sets: F, cat: 'essen', type: 'who', own: 'Wer von euch kocht besser?' },
    { id: 'wu3', sets: F, cat: 'persoenlichkeit', type: 'who', own: 'Wer von euch ist schneller beleidigt?' },
    { id: 'wu4', sets: F, cat: 'reisen', type: 'who', own: 'Wer von euch würde sich im Urlaub eher verlaufen?' },
    { id: 'wu5', sets: F, cat: 'alltag', type: 'who', own: 'Wer von euch ist ordentlicher?' },
    { id: 'wu6', sets: F, cat: 'musik', type: 'who', own: 'Wer von euch hat den besseren Musikgeschmack?' },
    { id: 'wu7', sets: F, cat: 'waswaere', type: 'who', own: 'Wer von euch würde eine Zombie-Apokalypse länger überleben?' },
    { id: 'wu8', sets: F, cat: 'persoenlichkeit', type: 'who', own: 'Wer von euch ist lustiger?' },
    { id: 'wu9', sets: F, cat: 'kindheit', type: 'who', own: 'Wer von euch war als Kind frecher?' },
    { id: 'wu10', sets: F, cat: 'alltag', type: 'who', own: 'Wer von euch verbringt mehr Zeit am Handy?' },
    { id: 'wu11', sets: FR, cat: 'persoenlichkeit', type: 'who', own: 'Wer von euch ist auf Partys länger dabei?' },
    { id: 'wu12', sets: PA, cat: 'liebe', type: 'who', own: 'Wer von euch hat zuerst „Ich liebe dich“ gesagt?' },
    { id: 'wu13', sets: PA, cat: 'liebe', type: 'who', own: 'Wer von euch ist romantischer?' },
    { id: 'wu14', sets: PA, cat: 'liebe', type: 'who', own: 'Wer von euch entschuldigt sich nach einem Streit zuerst?' },
    { id: 'wu15', sets: PA, cat: 'liebe', type: 'who', own: 'Wer von euch klaut nachts die Decke?' },

    // ── Neu: nur Freunde ───────────────────────────────────────────────────
    { id: 'fr1', sets: FR, cat: 'alltag', type: 'pick4', own: 'Was machst du am ehesten, wenn die Gruppe nicht weiß, wohin?', other: 'Was macht {n} am ehesten, wenn die Gruppe nicht weiß, wohin?', options: ['Entscheiden', 'Abstimmen lassen', 'Mitlaufen', 'Nach Hause gehen'] },
    { id: 'fr2', sets: FR, cat: 'persoenlichkeit', type: 'pair', own: 'Lieber großer Freundeskreis oder wenige enge Freunde?', options: [{ label: 'Großer Kreis', icon: '👥' }, { label: 'Wenige enge', icon: '🤝' }] },
]
