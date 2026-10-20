// Testify: feste Fragen (Rückfall, wenn keine KI-Fragen kommen) und Themen.
// Jede Frage: id, cat (Thema, siehe CATEGORIES), type und Texte. Immer eindeutig, um wen es geht:
//   own   = Frage an dich („Hast du …?“, „Was ist dir lieber …?“)
//   other = dieselbe Frage über den anderen ({n} = Name: „Hat {n} …?“, „Was ist {n} lieber …?“)
// Typen:
//   pick4  – own/other, options: 4 Antworten
//   pair   – own/other, options: 2 × { label, icon } (eigene Antwort + Tipp auf einem Bildschirm)
//   scale  – own/other, labels: 5 Beschriftungen für 1–5 (Ränder = labels[0] und labels[4])
//   emoji4 – Bildwahl: own/other, options: 4 × { label, icon } (große Kacheln 2 × 2)
//   yesno  – own/other (Ja/Nein fest, beides auf einem Bildschirm)
//   who    – Wer von uns?: own mit {n} („… – du oder {n}?“), beide antworten, kein Tipp (zählt nur gemeinsam)
// Formulierungen neutral (kein Gendern nötig: „Früh aufstehen“ statt „Frühaufsteherin“).

/** Themen (Chips in „Spiel einrichten“); Reihenfolge = Anzeige */
export const CATEGORIES = {
    essen: 'Essen & Trinken',
    reisen: 'Reisen',
    musik: 'Musik',
    film: 'Filme & Serien',
    alltag: 'Alltag',
    persoenlichkeit: 'Persönlichkeit',
    kindheit: 'Kindheit',
    waswaere: 'Was wäre wenn',
    sport: 'Sport',
    arbeit: 'Arbeit & Schule',
    party: 'Party',
    freunde: 'Freundeskreis',
    liebe: 'Paar & Liebe',
}
export const CATEGORY_ICON = {
    essen: '🍕', reisen: '✈️', musik: '🎵', film: '🎬', alltag: '☕', persoenlichkeit: '🧠', kindheit: '🧸',
    waswaere: '🔮', sport: '⚽', arbeit: '💼', party: '🎉', freunde: '👯', liebe: '💘',
}
/** Vorauswahl beim ersten Spiel */
export const DEFAULT_THEMES = ['essen', 'reisen', 'musik', 'alltag', 'persoenlichkeit', 'waswaere']

export const QUESTIONS = [
    // ── Essen & Trinken ────────────────────────────────────────────────────
    { id: 'es1', cat: 'essen', type: 'pick4', own: 'Was bestellst du dir am ehesten?', other: 'Was bestellt sich {n} am ehesten?', options: ['Pizza', 'Sushi', 'Burger', 'Döner'] },
    { id: 'es2', cat: 'essen', type: 'pair', own: 'Was ist dir lieber: süß oder salzig?', other: 'Was ist {n} lieber: süß oder salzig?', options: [{ label: 'Süß', icon: '🍫' }, { label: 'Salzig', icon: '🥨' }] },
    { id: 'es3', cat: 'essen', type: 'scale', own: 'Wie scharf isst du gern?', other: 'Wie scharf isst {n} gern?', labels: ['Gar nicht', 'Ein bisschen', 'Mittel', 'Scharf', 'Feuer frei'] },
    { id: 'es4', cat: 'essen', type: 'pair', own: 'Was trinkst du lieber: Kaffee oder Tee?', other: 'Was trinkt {n} lieber: Kaffee oder Tee?', options: [{ label: 'Kaffee', icon: '☕' }, { label: 'Tee', icon: '🍵' }] },
    { id: 'es5', cat: 'essen', type: 'pick4', own: 'Welches Frühstück passt am besten zu dir?', other: 'Welches Frühstück passt am besten zu {n}?', options: ['Brötchen', 'Müsli', 'Rührei', 'Nur Kaffee'] },
    { id: 'es6', cat: 'essen', type: 'scale', own: 'Wie gern kochst du selbst?', other: 'Wie gern kocht {n} selbst?', labels: ['Nie', 'Wenn es sein muss', 'Ab und zu', 'Gern', 'Leidenschaft'] },
    { id: 'es7', cat: 'essen', type: 'pick4', own: 'Welche Küche würdest du am ehesten wählen?', other: 'Welche Küche würde {n} am ehesten wählen?', options: ['Italienisch', 'Asiatisch', 'Mexikanisch', 'Deutsch'] },
    { id: 'es8', cat: 'essen', type: 'pick4', own: 'Was darf auf deiner Pizza nie fehlen?', other: 'Was darf auf der Pizza von {n} nie fehlen?', options: ['Salami', 'Pilze', 'Ananas', 'Extra Käse'] },
    { id: 'es9', cat: 'essen', type: 'pair', own: 'Was isst du lieber: Pizza oder Pasta?', other: 'Was isst {n} lieber: Pizza oder Pasta?', options: [{ label: 'Pizza', icon: '🍕' }, { label: 'Pasta', icon: '🍝' }] },
    { id: 'bw3', cat: 'essen', type: 'emoji4', own: 'Welchen Snack nimmst du beim Filmabend?', other: 'Welchen Snack nimmt {n} beim Filmabend?', options: [{ label: 'Popcorn', icon: '🍿' }, { label: 'Chips', icon: '🥔' }, { label: 'Schokolade', icon: '🍫' }, { label: 'Obst', icon: '🍓' }] },
    { id: 'bw6', cat: 'essen', type: 'emoji4', own: 'Was trinkst du am liebsten am Freitagabend?', other: 'Was trinkt {n} am liebsten am Freitagabend?', options: [{ label: 'Bier', icon: '🍺' }, { label: 'Wein', icon: '🍷' }, { label: 'Cocktail', icon: '🍹' }, { label: 'Limo', icon: '🥤' }] },
    { id: 'sm3', cat: 'essen', type: 'yesno', own: 'Hast du schon mal Insekten gegessen?', other: 'Hat {n} schon mal Insekten gegessen?' },
    { id: 'sm11', cat: 'essen', type: 'yesno', own: 'Hast du schon mal etwas vom Boden gegessen (5-Sekunden-Regel)?', other: 'Hat {n} schon mal etwas vom Boden gegessen (5-Sekunden-Regel)?' },
    { id: 'wu2', cat: 'essen', type: 'who', own: 'Wer kocht besser – du oder {n}?' },

    // ── Reisen ─────────────────────────────────────────────────────────────
    { id: 're1', cat: 'reisen', type: 'pair', own: 'Was ist dir lieber: Strand oder Berge?', other: 'Was ist {n} lieber: Strand oder Berge?', options: [{ label: 'Strand', icon: '🏖️' }, { label: 'Berge', icon: '⛰️' }] },
    { id: 're2', cat: 'reisen', type: 'pick4', own: 'Wohin würdest du sofort reisen?', other: 'Wohin würde {n} sofort reisen?', options: ['Japan', 'New York', 'Island', 'Bali'] },
    { id: 're3', cat: 'reisen', type: 'pair', own: 'Was ist dir im Urlaub lieber: Städtetrip oder Natur?', other: 'Was ist {n} im Urlaub lieber: Städtetrip oder Natur?', options: [{ label: 'Städtetrip', icon: '🏙️' }, { label: 'Natur', icon: '🌲' }] },
    { id: 're4', cat: 'reisen', type: 'scale', own: 'Wie spontan planst du deinen Urlaub?', other: 'Wie spontan plant {n} den Urlaub?', labels: ['Alles durchgeplant', 'Grob geplant', 'Halb-halb', 'Eher spontan', 'Last Minute'] },
    { id: 're5', cat: 'reisen', type: 'pick4', own: 'Wie reist du am liebsten?', other: 'Wie reist {n} am liebsten?', options: ['Flugzeug', 'Auto', 'Zug', 'Wohnmobil'] },
    { id: 're6', cat: 'reisen', type: 'pair', own: 'Wo schläfst du im Urlaub lieber: Hotel oder Zelt?', other: 'Wo schläft {n} im Urlaub lieber: Hotel oder Zelt?', options: [{ label: 'Hotel', icon: '🏨' }, { label: 'Zelt', icon: '⛺' }] },
    { id: 're7', cat: 'reisen', type: 'pick4', own: 'Was darf in deinem Urlaub auf keinen Fall fehlen?', other: 'Was darf im Urlaub von {n} auf keinen Fall fehlen?', options: ['Gutes Essen', 'Sonne', 'Abenteuer', 'Ausschlafen'] },
    { id: 're8', cat: 'reisen', type: 'pick4', own: 'Was nervt dich im Urlaub am meisten?', other: 'Was nervt {n} im Urlaub am meisten?', options: ['Hitze', 'Touristen', 'Schlechtes Essen', 'Mücken'] },
    { id: 're9', cat: 'reisen', type: 'scale', own: 'Wie abenteuerlustig bist du auf Reisen?', other: 'Wie abenteuerlustig ist {n} auf Reisen?', labels: ['All-inclusive', 'Gemütlich', 'Mittel', 'Abenteuer', 'Rucksack ins Ungewisse'] },
    { id: 'bw4', cat: 'reisen', type: 'emoji4', own: 'Wo würdest du am liebsten übernachten?', other: 'Wo würde {n} am liebsten übernachten?', options: [{ label: 'Baumhaus', icon: '🌳' }, { label: 'Schloss', icon: '🏰' }, { label: 'Iglu', icon: '🧊' }, { label: 'Hausboot', icon: '🛥️' }] },
    { id: 'bw11', cat: 'reisen', type: 'emoji4', own: 'Welche Landschaft macht dich am glücklichsten?', other: 'Welche Landschaft macht {n} am glücklichsten?', options: [{ label: 'Meer', icon: '🌊' }, { label: 'Wald', icon: '🌲' }, { label: 'Wüste', icon: '🏜️' }, { label: 'Großstadt', icon: '🌆' }] },
    { id: 'sm2', cat: 'reisen', type: 'yesno', own: 'Hast du schon mal einen Flug verpasst?', other: 'Hat {n} schon mal einen Flug verpasst?' },
    { id: 'sm8', cat: 'reisen', type: 'yesno', own: 'Bist du schon mal allein verreist?', other: 'Ist {n} schon mal allein verreist?' },
    { id: 'wu4', cat: 'reisen', type: 'who', own: 'Wer würde sich im Urlaub eher verlaufen – du oder {n}?' },

    // ── Musik ──────────────────────────────────────────────────────────────
    { id: 'mu1', cat: 'musik', type: 'pick4', own: 'Welche dieser Bands würdest du am ehesten live sehen?', other: 'Welche dieser Bands würde {n} am ehesten live sehen?', options: ['Linkin Park', 'Foo Fighters', 'Die Ärzte', 'Coldplay'] },
    { id: 'mu2', cat: 'musik', type: 'pick4', own: 'Welches Festival reizt dich am meisten?', other: 'Welches Festival reizt {n} am meisten?', options: ['Rock am Ring', 'Parookaville', 'Tomorrowland', 'Wacken'] },
    { id: 'mu3', cat: 'musik', type: 'pick4', own: 'Was läuft bei dir im Auto am ehesten?', other: 'Was läuft bei {n} im Auto am ehesten?', options: ['Charts', 'Deutschrap', 'Rock', 'Podcast'] },
    { id: 'mu4', cat: 'musik', type: 'pair', own: 'Was machst du lieber: Karaoke singen oder zuhören?', other: 'Was macht {n} lieber: Karaoke singen oder zuhören?', options: [{ label: 'Karaoke', icon: '🎤' }, { label: 'Zuhören', icon: '🎧' }] },
    { id: 'mu5', cat: 'musik', type: 'scale', own: 'Wie laut drehst du deine Lieblingsmusik auf?', other: 'Wie laut dreht {n} die Lieblingsmusik auf?', labels: ['Eher leise', 'Gemütlich', 'Normal', 'Ordentlich laut', 'Nachbarn wecken'] },
    { id: 'mu6', cat: 'musik', type: 'pick4', own: 'Welches Jahrzehnt hat für dich die beste Musik?', other: 'Welches Jahrzehnt hat für {n} die beste Musik?', options: ['80er', '90er', '2000er', 'Heute'] },
    { id: 'mu7', cat: 'musik', type: 'pair', own: 'Wo bist du lieber: Konzert oder Club?', other: 'Wo ist {n} lieber: Konzert oder Club?', options: [{ label: 'Konzert', icon: '🎸' }, { label: 'Club', icon: '🪩' }] },
    { id: 'mu8', cat: 'musik', type: 'scale', own: 'Wie textsicher bist du bei deinen Lieblingsliedern?', other: 'Wie textsicher ist {n} bei den Lieblingsliedern?', labels: ['Nur der Refrain', 'Ein paar Zeilen', 'Meistens', 'Fast alles', 'Jedes Wort'] },
    { id: 'bw9', cat: 'musik', type: 'emoji4', own: 'Welches Instrument würdest du gern spielen?', other: 'Welches Instrument würde {n} gern spielen?', options: [{ label: 'Gitarre', icon: '🎸' }, { label: 'Klavier', icon: '🎹' }, { label: 'Schlagzeug', icon: '🥁' }, { label: 'Saxofon', icon: '🎷' }] },
    { id: 'sm5', cat: 'musik', type: 'yesno', own: 'Hast du schon mal auf einer Bühne gestanden?', other: 'Hat {n} schon mal auf einer Bühne gestanden?' },
    { id: 'wu6', cat: 'musik', type: 'who', own: 'Wer hat den besseren Musikgeschmack – du oder {n}?' },

    // ── Filme & Serien ─────────────────────────────────────────────────────
    { id: 'al5', cat: 'film', type: 'pick4', own: 'Welche Serie würdest du sofort nochmal schauen?', other: 'Welche Serie würde {n} sofort nochmal schauen?', options: ['Breaking Bad', 'Friends', 'Stranger Things', 'Game of Thrones'] },
    { id: 'al10', cat: 'film', type: 'pair', own: 'Was schaust du lieber: Serie oder Film?', other: 'Was schaut {n} lieber: Serie oder Film?', options: [{ label: 'Serie', icon: '📺' }, { label: 'Film', icon: '🎬' }] },
    { id: 'pe6', cat: 'film', type: 'pick4', own: 'Was wärst du in einem Film am ehesten?', other: 'Was wäre {n} in einem Film am ehesten?', options: ['Held', 'Bösewicht', 'Sidekick', 'Comic-Relief'] },
    { id: 'sm6', cat: 'film', type: 'yesno', own: 'Hast du schon mal bei einem Film geweint?', other: 'Hat {n} schon mal bei einem Film geweint?' },
    { id: 'fi1', cat: 'film', type: 'pick4', own: 'Welches Genre schaust du am liebsten?', other: 'Welches Genre schaut {n} am liebsten?', options: ['Komödie', 'Horror', 'Action', 'Liebesfilm'] },
    { id: 'fi2', cat: 'film', type: 'emoji4', own: 'In welcher Filmwelt würdest du am liebsten leben?', other: 'In welcher Filmwelt würde {n} am liebsten leben?', options: [{ label: 'Zauberschule', icon: '🧙' }, { label: 'Weltraum', icon: '🚀' }, { label: 'Dinopark', icon: '🦖' }, { label: 'Märchenwald', icon: '🧚' }] },
    { id: 'fi3', cat: 'film', type: 'scale', own: 'Wie gruselfest bist du bei Horrorfilmen?', other: 'Wie gruselfest ist {n} bei Horrorfilmen?', labels: ['Augen zu', 'Hinter dem Kissen', 'Geht so', 'Ziemlich cool', 'Lacht drüber'] },
    { id: 'fi4', cat: 'film', type: 'pair', own: 'Wo schaust du Filme lieber: Kino oder Couch?', other: 'Wo schaut {n} Filme lieber: Kino oder Couch?', options: [{ label: 'Kino', icon: '🎟️' }, { label: 'Couch', icon: '🛋️' }] },
    { id: 'fi5', cat: 'film', type: 'yesno', own: 'Hast du schon mal einen Film mehr als fünfmal gesehen?', other: 'Hat {n} schon mal einen Film mehr als fünfmal gesehen?' },
    { id: 'fi6', cat: 'film', type: 'who', own: 'Wer schläft beim Filmabend eher ein – du oder {n}?' },
    { id: 'fi7', cat: 'film', type: 'pick4', own: 'Wie schaust du eine neue Serie?', other: 'Wie schaut {n} eine neue Serie?', options: ['Alles an einem Wochenende', 'Eine Folge pro Abend', 'Nebenbei', 'Nach drei Folgen aufgeben'] },

    // ── Alltag ─────────────────────────────────────────────────────────────
    { id: 'al2', cat: 'alltag', type: 'pick4', own: 'Wie verbringst du am liebsten einen freien Sonntag?', other: 'Wie verbringt {n} am liebsten einen freien Sonntag?', options: ['Ausschlafen', 'Sport', 'Freunde treffen', 'Serien schauen'] },
    { id: 'al3', cat: 'alltag', type: 'pair', own: 'Was magst du lieber: Hund oder Katze?', other: 'Was mag {n} lieber: Hund oder Katze?', options: [{ label: 'Hund', icon: '🐶' }, { label: 'Katze', icon: '🐱' }] },
    { id: 'al4', cat: 'alltag', type: 'scale', own: 'Wie ordentlich ist dein Zimmer gerade?', other: 'Wie ordentlich ist das Zimmer von {n} gerade?', labels: ['Chaos pur', 'Unordentlich', 'Geht so', 'Ziemlich ordentlich', 'Wie im Katalog'] },
    { id: 'al6', cat: 'alltag', type: 'pair', own: 'Wann duschst du lieber: morgens oder abends?', other: 'Wann duscht {n} lieber: morgens oder abends?', options: [{ label: 'Morgens', icon: '🌅' }, { label: 'Abends', icon: '🌙' }] },
    { id: 'al7', cat: 'alltag', type: 'scale', own: 'Wie oft schaust du am Tag aufs Handy?', other: 'Wie oft schaut {n} am Tag aufs Handy?', labels: ['Kaum', 'Ab und zu', 'Normal', 'Ständig', 'Handy klebt an der Hand'] },
    { id: 'al9', cat: 'alltag', type: 'pick4', own: 'Was machst du als Erstes nach dem Aufwachen?', other: 'Was macht {n} als Erstes nach dem Aufwachen?', options: ['Handy checken', 'Kaffee', 'Duschen', 'Snoozen'] },
    { id: 'bw10', cat: 'alltag', type: 'emoji4', own: 'Welcher Wochentag ist dein liebster?', other: 'Welcher Wochentag ist der liebste von {n}?', options: [{ label: 'Freitag', icon: '🎉' }, { label: 'Samstag', icon: '🛍️' }, { label: 'Sonntag', icon: '😴' }, { label: 'Mittwoch', icon: '🐫' }] },
    { id: 'sm1', cat: 'alltag', type: 'yesno', own: 'Hast du schon mal eine Nacht komplett durchgemacht?', other: 'Hat {n} schon mal eine Nacht komplett durchgemacht?' },
    { id: 'sm7', cat: 'alltag', type: 'yesno', own: 'Hast du schon mal deinen eigenen Geburtstag vergessen?', other: 'Hat {n} schon mal den eigenen Geburtstag vergessen?' },
    { id: 'sm12', cat: 'alltag', type: 'yesno', own: 'Hast du schon mal in der Öffentlichkeit laut gesungen?', other: 'Hat {n} schon mal in der Öffentlichkeit laut gesungen?' },
    { id: 'wu1', cat: 'alltag', type: 'who', own: 'Wer kommt öfter zu spät – du oder {n}?' },
    { id: 'wu5', cat: 'alltag', type: 'who', own: 'Wer ist ordentlicher – du oder {n}?' },
    { id: 'wu10', cat: 'alltag', type: 'who', own: 'Wer verbringt mehr Zeit am Handy – du oder {n}?' },

    // ── Persönlichkeit ─────────────────────────────────────────────────────
    { id: 'pe1', cat: 'persoenlichkeit', type: 'pair', own: 'Was liegt dir mehr: früh aufstehen oder spät aufstehen?', other: 'Was liegt {n} mehr: früh aufstehen oder spät aufstehen?', options: [{ label: 'Früh aufstehen', icon: '🐓' }, { label: 'Spät aufstehen', icon: '🦉' }] },
    { id: 'pe2', cat: 'persoenlichkeit', type: 'scale', own: 'Wie gut kannst du ein Geheimnis für dich behalten?', other: 'Wie gut kann {n} ein Geheimnis für sich behalten?', labels: ['Gar nicht', 'Eher schlecht', 'Geht so', 'Gut', 'Wie ein Tresor'] },
    { id: 'pe3', cat: 'persoenlichkeit', type: 'pick4', own: 'Welche Superkraft hättest du am liebsten?', other: 'Welche Superkraft hätte {n} am liebsten?', options: ['Fliegen', 'Unsichtbar sein', 'Gedanken lesen', 'Zeitreisen'] },
    { id: 'pe4', cat: 'persoenlichkeit', type: 'pair', own: 'Was bist du eher: Planer oder spontan?', other: 'Was ist {n} eher: Planer oder spontan?', options: [{ label: 'Planen', icon: '📋' }, { label: 'Spontan', icon: '🎲' }] },
    { id: 'pe5', cat: 'persoenlichkeit', type: 'scale', own: 'Wie schnell bist du genervt?', other: 'Wie schnell ist {n} genervt?', labels: ['Die Ruhe selbst', 'Entspannt', 'Normal', 'Recht schnell', 'Kurze Zündschnur'] },
    { id: 'pe7', cat: 'persoenlichkeit', type: 'pair', own: 'Was machst du lieber: reden oder zuhören?', other: 'Was macht {n} lieber: reden oder zuhören?', options: [{ label: 'Reden', icon: '🗣️' }, { label: 'Zuhören', icon: '👂' }] },
    { id: 'pe8', cat: 'persoenlichkeit', type: 'scale', own: 'Wie risikofreudig bist du?', other: 'Wie risikofreudig ist {n}?', labels: ['Safety first', 'Vorsichtig', 'Mittel', 'Mutig', 'Kein Limit'] },
    { id: 'pe10', cat: 'persoenlichkeit', type: 'pick4', own: 'Wie reagierst du auf Streit?', other: 'Wie reagiert {n} auf Streit?', options: ['Sofort klären', 'Erst mal Ruhe', 'Witz machen', 'Laut werden'] },
    { id: 'bw1', cat: 'persoenlichkeit', type: 'emoji4', own: 'Welches Tier passt am besten zu dir?', other: 'Welches Tier passt am besten zu {n}?', options: [{ label: 'Faultier', icon: '🦥' }, { label: 'Fuchs', icon: '🦊' }, { label: 'Löwe', icon: '🦁' }, { label: 'Eule', icon: '🦉' }] },
    { id: 'bw2', cat: 'persoenlichkeit', type: 'emoji4', own: 'Welches Wetter passt am besten zu dir?', other: 'Welches Wetter passt am besten zu {n}?', options: [{ label: 'Sonne', icon: '☀️' }, { label: 'Regen', icon: '🌧️' }, { label: 'Schnee', icon: '❄️' }, { label: 'Gewitter', icon: '⛈️' }] },
    { id: 'bw12', cat: 'persoenlichkeit', type: 'emoji4', own: 'Welcher Emoji beschreibt dich am besten?', other: 'Welcher Emoji beschreibt {n} am besten?', options: [{ label: 'Lachen', icon: '😂' }, { label: 'Cool', icon: '😎' }, { label: 'Nachdenklich', icon: '🤔' }, { label: 'Verliebt', icon: '😍' }] },
    { id: 'sm10', cat: 'persoenlichkeit', type: 'yesno', own: 'Hast du schon mal eine Ausrede erfunden, um nicht zu einer Party zu müssen?', other: 'Hat {n} schon mal eine Ausrede erfunden, um nicht zu einer Party zu müssen?' },
    { id: 'wu3', cat: 'persoenlichkeit', type: 'who', own: 'Wer ist schneller beleidigt – du oder {n}?' },
    { id: 'wu8', cat: 'persoenlichkeit', type: 'who', own: 'Wer ist lustiger – du oder {n}?' },

    // ── Kindheit ───────────────────────────────────────────────────────────
    { id: 'kh1', cat: 'kindheit', type: 'pick4', own: 'Was wolltest du als Kind am ehesten werden?', other: 'Was wollte {n} als Kind am ehesten werden?', options: ['Polizei', 'Tierarzt', 'Astronaut', 'Fußballprofi'] },
    { id: 'kh2', cat: 'kindheit', type: 'pick4', own: 'Welche Süßigkeit war als Kind dein Favorit?', other: 'Welche Süßigkeit war als Kind der Favorit von {n}?', options: ['Gummibärchen', 'Schokolade', 'Brausepulver', 'Lutscher'] },
    { id: 'kh3', cat: 'kindheit', type: 'pick4', own: 'Was hast du als Kind am liebsten gespielt?', other: 'Was hat {n} als Kind am liebsten gespielt?', options: ['Lego', 'Draußen toben', 'Videospiele', 'Brettspiele'] },
    { id: 'kh4', cat: 'kindheit', type: 'pair', own: 'Was hast du als Kind lieber gemacht: Zeichentrick schauen oder draußen spielen?', other: 'Was hat {n} als Kind lieber gemacht: Zeichentrick schauen oder draußen spielen?', options: [{ label: 'Zeichentrick', icon: '📺' }, { label: 'Draußen', icon: '🌳' }] },
    { id: 'kh5', cat: 'kindheit', type: 'scale', own: 'Wie brav warst du als Kind?', other: 'Wie brav war {n} als Kind?', labels: ['Kleiner Teufel', 'Frech', 'Mal so, mal so', 'Ziemlich brav', 'Engel'] },
    { id: 'bw8', cat: 'kindheit', type: 'emoji4', own: 'Welches Spielzeug hättest du als Kind am liebsten gehabt?', other: 'Welches Spielzeug hätte {n} als Kind am liebsten gehabt?', options: [{ label: 'Teddy', icon: '🧸' }, { label: 'Spielkonsole', icon: '🎮' }, { label: 'Fahrrad', icon: '🚲' }, { label: 'Baukasten', icon: '🧱' }] },
    { id: 'sm4', cat: 'kindheit', type: 'yesno', own: 'Bist du als Kind schon mal von zu Hause „abgehauen“?', other: 'Ist {n} als Kind schon mal von zu Hause „abgehauen“?' },
    { id: 'wu9', cat: 'kindheit', type: 'who', own: 'Wer war als Kind frecher – du oder {n}?' },

    // ── Was wäre wenn ──────────────────────────────────────────────────────
    { id: 'ww1', cat: 'waswaere', type: 'pick4', own: 'Du gewinnst eine Million – was machst du zuerst?', other: '{n} gewinnt eine Million – was macht {n} zuerst?', options: ['Weltreise', 'Haus kaufen', 'Sparen', 'Party für alle'] },
    { id: 'ww2', cat: 'waswaere', type: 'pick4', own: 'Du darfst ein Jahr in einer anderen Zeit leben – welche wählst du?', other: '{n} darf ein Jahr in einer anderen Zeit leben – welche wählt {n}?', options: ['Steinzeit', 'Mittelalter', '80er', 'Zukunft'] },
    { id: 'ww3', cat: 'waswaere', type: 'pick4', own: 'Zombie-Apokalypse: Was wäre deine Rolle?', other: 'Zombie-Apokalypse: Was wäre die Rolle von {n}?', options: ['Anführer', 'Koch', 'Erste, die es erwischt', 'Einzelkämpfer'] },
    { id: 'ww4', cat: 'waswaere', type: 'pair', own: 'Was wärst du lieber: fliegen können oder unsichtbar sein?', other: 'Was wäre {n} lieber: fliegen können oder unsichtbar sein?', options: [{ label: 'Fliegen', icon: '🦅' }, { label: 'Unsichtbar', icon: '👻' }] },
    { id: 'ww5', cat: 'waswaere', type: 'scale', own: 'Wie lange würdest du ohne Handy durchhalten?', other: 'Wie lange würde {n} ohne Handy durchhalten?', labels: ['Eine Stunde', 'Einen Tag', 'Eine Woche', 'Einen Monat', 'Für immer'] },
    { id: 'bw7', cat: 'waswaere', type: 'emoji4', own: 'Du bekommst ein Fahrzeug geschenkt – welches wählst du?', other: '{n} bekommt ein Fahrzeug geschenkt – welches wählt {n}?', options: [{ label: 'Sportwagen', icon: '🏎️' }, { label: 'Motorrad', icon: '🏍️' }, { label: 'Wohnmobil', icon: '🚐' }, { label: 'Segelboot', icon: '⛵' }] },
    { id: 'sm9', cat: 'waswaere', type: 'yesno', own: 'Würdest du für ein Jahr auf eine einsame Insel ziehen?', other: 'Würde {n} für ein Jahr auf eine einsame Insel ziehen?' },
    { id: 'wu7', cat: 'waswaere', type: 'who', own: 'Wer würde eine Zombie-Apokalypse länger überleben – du oder {n}?' },

    // ── Sport ──────────────────────────────────────────────────────────────
    { id: 'bw5', cat: 'sport', type: 'emoji4', own: 'Welcher Sport liegt dir am meisten?', other: 'Welcher Sport liegt {n} am meisten?', options: [{ label: 'Fußball', icon: '⚽' }, { label: 'Schwimmen', icon: '🏊' }, { label: 'Fitness', icon: '🏋️' }, { label: 'Couch', icon: '🛋️' }] },
    { id: 'sp1', cat: 'sport', type: 'pick4', own: 'Welchen Sport schaust du am liebsten im Fernsehen?', other: 'Welchen Sport schaut {n} am liebsten im Fernsehen?', options: ['Fußball', 'Formel 1', 'Wintersport', 'Gar keinen'] },
    { id: 'sp2', cat: 'sport', type: 'scale', own: 'Wie sportlich bist du?', other: 'Wie sportlich ist {n}?', labels: ['Sofa-Profi', 'Ab und zu', 'Normal', 'Sehr sportlich', 'Maschine'] },
    { id: 'sp3', cat: 'sport', type: 'pair', own: 'Was machst du lieber: laufen oder Rad fahren?', other: 'Was macht {n} lieber: laufen oder Rad fahren?', options: [{ label: 'Laufen', icon: '🏃' }, { label: 'Rad fahren', icon: '🚴' }] },
    { id: 'sp4', cat: 'sport', type: 'yesno', own: 'Hast du schon mal bei einem Lauf mit Startnummer mitgemacht?', other: 'Hat {n} schon mal bei einem Lauf mit Startnummer mitgemacht?' },
    { id: 'sp5', cat: 'sport', type: 'who', own: 'Wer ist sportlicher – du oder {n}?' },
    { id: 'sp6', cat: 'sport', type: 'emoji4', own: 'In welcher Disziplin hättest du die besten Chancen auf Gold?', other: 'In welcher Disziplin hätte {n} die besten Chancen auf Gold?', options: [{ label: 'Sprint', icon: '🏃' }, { label: 'Bogenschießen', icon: '🏹' }, { label: 'Schach', icon: '♟️' }, { label: 'Ausschlafen', icon: '😴' }] },
    { id: 'sp7', cat: 'sport', type: 'pick4', own: 'Was motiviert dich am ehesten zum Sport?', other: 'Was motiviert {n} am ehesten zum Sport?', options: ['Gesundheit', 'Gutes Aussehen', 'Freunde', 'Nichts'] },
    { id: 'sp8', cat: 'sport', type: 'scale', own: 'Wie ehrgeizig bist du bei Spielen?', other: 'Wie ehrgeizig ist {n} bei Spielen?', labels: ['Dabei sein ist alles', 'Locker', 'Mittel', 'Will gewinnen', 'Schlechter Verlierer'] },
    { id: 'sp9', cat: 'sport', type: 'pair', own: 'Was liegt dir mehr: Mannschaftssport oder allein trainieren?', other: 'Was liegt {n} mehr: Mannschaftssport oder allein trainieren?', options: [{ label: 'Mannschaft', icon: '👥' }, { label: 'Allein', icon: '🧘' }] },

    // ── Arbeit & Schule ────────────────────────────────────────────────────
    { id: 'ar1', cat: 'arbeit', type: 'pick4', own: 'Welcher Job wäre für dich ein Traum?', other: 'Welcher Job wäre für {n} ein Traum?', options: ['Reiseblogger', 'Koch', 'Chef im eigenen Laden', 'Profisportler'] },
    { id: 'ar2', cat: 'arbeit', type: 'scale', own: 'Wie pünktlich bist du bei Terminen?', other: 'Wie pünktlich ist {n} bei Terminen?', labels: ['Immer zu spät', 'Oft knapp', 'Meistens pünktlich', 'Pünktlich', 'Zehn Minuten zu früh'] },
    { id: 'ar3', cat: 'arbeit', type: 'pair', own: 'Wo arbeitest du lieber: Homeoffice oder Büro?', other: 'Wo arbeitet {n} lieber: Homeoffice oder Büro?', options: [{ label: 'Homeoffice', icon: '🏠' }, { label: 'Büro', icon: '🏢' }] },
    { id: 'ar4', cat: 'arbeit', type: 'yesno', own: 'Hast du schon mal verschlafen und bist zu spät zur Arbeit oder Schule gekommen?', other: 'Hat {n} schon mal verschlafen und ist zu spät zur Arbeit oder Schule gekommen?' },
    { id: 'ar5', cat: 'arbeit', type: 'who', own: 'Wer war in der Schule fleißiger – du oder {n}?' },
    { id: 'ar6', cat: 'arbeit', type: 'emoji4', own: 'Was war in der Schule dein Lieblingsfach?', other: 'Was war in der Schule das Lieblingsfach von {n}?', options: [{ label: 'Mathe', icon: '📐' }, { label: 'Sport', icon: '⚽' }, { label: 'Kunst', icon: '🎨' }, { label: 'Pause', icon: '🔔' }] },
    { id: 'ar7', cat: 'arbeit', type: 'pick4', own: 'Was machst du am liebsten in der Mittagspause?', other: 'Was macht {n} am liebsten in der Mittagspause?', options: ['Essen gehen', 'Durcharbeiten', 'Spazieren', 'Handy'] },
    { id: 'ar8', cat: 'arbeit', type: 'scale', own: 'Wie gut bleibst du unter Stress ruhig?', other: 'Wie gut bleibt {n} unter Stress ruhig?', labels: ['Panik', 'Eher nervös', 'Geht so', 'Ziemlich ruhig', 'Eiskalt'] },
    { id: 'ar9', cat: 'arbeit', type: 'pair', own: 'Was liegt dir mehr: früh anfangen oder lange bleiben?', other: 'Was liegt {n} mehr: früh anfangen oder lange bleiben?', options: [{ label: 'Früh anfangen', icon: '🌅' }, { label: 'Lange bleiben', icon: '🌙' }] },
    { id: 'ar10', cat: 'arbeit', type: 'yesno', own: 'Hast du schon mal bei einer Klassenarbeit geschummelt?', other: 'Hat {n} schon mal bei einer Klassenarbeit geschummelt?' },

    // ── Party ──────────────────────────────────────────────────────────────
    { id: 'al1', cat: 'party', type: 'scale', own: 'Wie gern gehst du am Wochenende feiern?', other: 'Wie gern geht {n} am Wochenende feiern?', labels: ['Lieber Sofa', 'Selten', 'Ab und zu', 'Sehr gern', 'Bis zum Morgen'] },
    { id: 'wu11', cat: 'party', type: 'who', own: 'Wer bleibt auf Partys länger – du oder {n}?' },
    { id: 'pa1', cat: 'party', type: 'pick4', own: 'Was bist du auf Partys am ehesten?', other: 'Was ist {n} auf Partys am ehesten?', options: ['Tanzfläche', 'Küche', 'DJ-Pult', 'Früh weg'] },
    { id: 'pa2', cat: 'party', type: 'pair', own: 'Was machst du auf Partys lieber: tanzen oder quatschen?', other: 'Was macht {n} auf Partys lieber: tanzen oder quatschen?', options: [{ label: 'Tanzen', icon: '💃' }, { label: 'Quatschen', icon: '💬' }] },
    { id: 'pa3', cat: 'party', type: 'yesno', own: 'Hast du schon mal bis zum Sonnenaufgang gefeiert?', other: 'Hat {n} schon mal bis zum Sonnenaufgang gefeiert?' },
    { id: 'pa4', cat: 'party', type: 'emoji4', own: 'Welches Partymotto wäre deins?', other: 'Welches Partymotto wäre das von {n}?', options: [{ label: '80er', icon: '🕺' }, { label: 'Hawaii', icon: '🌺' }, { label: 'Grusel', icon: '🎃' }, { label: 'Glitzer', icon: '✨' }] },
    { id: 'pa5', cat: 'party', type: 'pick4', own: 'Wann gehst du meistens nach Hause?', other: 'Wann geht {n} meistens nach Hause?', options: ['Vor Mitternacht', 'Gegen eins', 'Wenn das Licht angeht', 'Am nächsten Mittag'] },
    { id: 'pa6', cat: 'party', type: 'who', own: 'Wer ist zuerst auf der Tanzfläche – du oder {n}?' },
    { id: 'pa7', cat: 'party', type: 'scale', own: 'Wie gut bist du im Partys organisieren?', other: 'Wie gut ist {n} im Partys organisieren?', labels: ['Lieber Gast', 'Mit Hilfe', 'Geht so', 'Gut', 'Partyprofi'] },
    { id: 'pa8', cat: 'party', type: 'pair', own: 'Was ist dir lieber: Hausparty oder Club?', other: 'Was ist {n} lieber: Hausparty oder Club?', options: [{ label: 'Hausparty', icon: '🏠' }, { label: 'Club', icon: '🪩' }] },

    // ── Freundeskreis ──────────────────────────────────────────────────────
    { id: 'al8', cat: 'freunde', type: 'pick4', own: 'Was machst du am ehesten bei einer Gruppenreise?', other: 'Was macht {n} am ehesten bei einer Gruppenreise?', options: ['Alles planen', 'Fahren', 'Für Stimmung sorgen', 'Mitlaufen'] },
    { id: 'pe9', cat: 'freunde', type: 'pick4', own: 'Welche Rolle hast du in der Freundesgruppe?', other: 'Welche Rolle hat {n} in der Freundesgruppe?', options: ['Organisator', 'Spaßvogel', 'Ruhepol', 'Ratgeber'] },
    { id: 'fr1', cat: 'freunde', type: 'pick4', own: 'Was machst du am ehesten, wenn die Gruppe nicht weiß, wohin?', other: 'Was macht {n} am ehesten, wenn die Gruppe nicht weiß, wohin?', options: ['Entscheiden', 'Abstimmen lassen', 'Mitlaufen', 'Nach Hause gehen'] },
    { id: 'fr2', cat: 'freunde', type: 'pair', own: 'Was ist dir lieber: großer Freundeskreis oder wenige enge Freunde?', other: 'Was ist {n} lieber: großer Freundeskreis oder wenige enge Freunde?', options: [{ label: 'Großer Kreis', icon: '👥' }, { label: 'Wenige enge', icon: '🤝' }] },
    { id: 'fr3', cat: 'freunde', type: 'who', own: 'Wer ist der bessere Zuhörer – du oder {n}?' },
    { id: 'fr4', cat: 'freunde', type: 'scale', own: 'Wie gut hältst du Kontakt zu alten Freunden?', other: 'Wie gut hält {n} Kontakt zu alten Freunden?', labels: ['Gar nicht', 'Selten', 'Ab und zu', 'Regelmäßig', 'Immer'] },
    { id: 'fr5', cat: 'freunde', type: 'yesno', own: 'Hast du schon mal eine Überraschungsparty für Freunde organisiert?', other: 'Hat {n} schon mal eine Überraschungsparty für Freunde organisiert?' },
    { id: 'fr6', cat: 'freunde', type: 'emoji4', own: 'Wohin würdest du am liebsten mit Freunden einen Ausflug machen?', other: 'Wohin würde {n} am liebsten mit Freunden einen Ausflug machen?', options: [{ label: 'Freizeitpark', icon: '🎢' }, { label: 'See', icon: '🏞️' }, { label: 'Städtetrip', icon: '🏙️' }, { label: 'Hütte', icon: '🛖' }] },
    { id: 'fr7', cat: 'freunde', type: 'pick4', own: 'Was ist dir in einer Freundschaft am wichtigsten?', other: 'Was ist {n} in einer Freundschaft am wichtigsten?', options: ['Ehrlichkeit', 'Spaß', 'Verlässlichkeit', 'Gleiche Hobbys'] },
    { id: 'fr8', cat: 'freunde', type: 'who', own: 'Wer vergisst eher Geburtstage – du oder {n}?' },

    // ── Paar & Liebe ───────────────────────────────────────────────────────
    { id: 'li1', cat: 'liebe', type: 'pick4', own: 'Was ist für dich das perfekte Date?', other: 'Was ist für {n} das perfekte Date?', options: ['Candle-Light-Dinner', 'Kino', 'Ausflug ins Grüne', 'Kochen zuhause'] },
    { id: 'li2', cat: 'liebe', type: 'scale', own: 'Wie romantisch bist du?', other: 'Wie romantisch ist {n}?', labels: ['Gar nicht', 'Ein bisschen', 'Mittel', 'Sehr', 'Hoffnungslos romantisch'] },
    { id: 'li3', cat: 'liebe', type: 'pair', own: 'Was brauchst du mehr: Kuscheln oder Freiraum?', other: 'Was braucht {n} mehr: Kuscheln oder Freiraum?', options: [{ label: 'Kuscheln', icon: '🤗' }, { label: 'Freiraum', icon: '🕊️' }] },
    { id: 'li4', cat: 'liebe', type: 'pick4', own: 'Womit zeigst du am ehesten Zuneigung?', other: 'Womit zeigt {n} am ehesten Zuneigung?', options: ['Worte', 'Geschenke', 'Zeit zusammen', 'Berührung'] },
    { id: 'li5', cat: 'liebe', type: 'scale', own: 'Wie eifersüchtig bist du?', other: 'Wie eifersüchtig ist {n}?', labels: ['Gar nicht', 'Kaum', 'Normal', 'Schon etwas', 'Sehr'] },
    { id: 'li6', cat: 'liebe', type: 'pair', own: 'Wie wichtig ist dir der Jahrestag: feiern oder egal?', other: 'Wie wichtig ist {n} der Jahrestag: feiern oder egal?', options: [{ label: 'Feiern', icon: '🥂' }, { label: 'Egal', icon: '🤷' }] },
    { id: 'li7', cat: 'liebe', type: 'pick4', own: 'Was nervt dich im Haushalt am meisten?', other: 'Was nervt {n} im Haushalt am meisten?', options: ['Abwaschen', 'Wäsche', 'Putzen', 'Einkaufen'] },
    { id: 'li8', cat: 'liebe', type: 'scale', own: 'Wie gern planst du Überraschungen?', other: 'Wie gern plant {n} Überraschungen?', labels: ['Nie', 'Selten', 'Ab und zu', 'Gern', 'Ständig'] },
    { id: 'li9', cat: 'liebe', type: 'pair', own: 'Was ist dir lieber: zusammen kochen oder essen gehen?', other: 'Was ist {n} lieber: zusammen kochen oder essen gehen?', options: [{ label: 'Kochen', icon: '🍳' }, { label: 'Essen gehen', icon: '🍽️' }] },
    { id: 'wu12', cat: 'liebe', type: 'who', own: 'Wer hat zuerst „Ich liebe dich“ gesagt – du oder {n}?' },
    { id: 'wu13', cat: 'liebe', type: 'who', own: 'Wer ist romantischer – du oder {n}?' },
    { id: 'wu14', cat: 'liebe', type: 'who', own: 'Wer entschuldigt sich nach einem Streit zuerst – du oder {n}?' },
    { id: 'wu15', cat: 'liebe', type: 'who', own: 'Wer klaut nachts die Decke – du oder {n}?' },
    { id: 'li10', cat: 'liebe', type: 'yesno', own: 'Hast du schon mal einen Liebesbrief geschrieben?', other: 'Hat {n} schon mal einen Liebesbrief geschrieben?' },
    { id: 'li11', cat: 'liebe', type: 'emoji4', own: 'Welches Geschenk freut dich am meisten?', other: 'Welches Geschenk freut {n} am meisten?', options: [{ label: 'Blumen', icon: '💐' }, { label: 'Schmuck', icon: '💍' }, { label: 'Ausflug', icon: '🎡' }, { label: 'Selbstgemacht', icon: '🎨' }] },
]
