import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, increment, deleteField, deleteDoc } from 'firebase/firestore'
import { questionCategories, getAllQuestions } from './data/questionCategories'
import './App.css'
import hkBackground from './assets/hk_background_fullwidth.png'
import hkLogo from './assets/hk_logo_vertical.png'
import hkLogoHorizontal from './assets/hk_logo_horizontal.png'

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA",
    authDomain: "hitzkopf-f0ea6.firebaseapp.com",
    projectId: "hitzkopf-f0ea6",
    storageBucket: "hitzkopf-f0ea6.firebasestorage.app",
    messagingSenderId: "828164655874",
    appId: "1:828164655874:web:1cab759bdb03bfb736101b"
};

// Emojis
// PERFORMANCE-FIX: Sortiere nur einmal beim Initialisieren, nicht bei jedem Import
const baseEmojis = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
// WICHTIG: Verwende einen festen Seed oder sortiere nur einmal
// Math.random() bei jedem Import würde zu unterschiedlichen Reihenfolgen führen
const availableEmojis = (() => {
    const shuffled = [...baseEmojis];
    // Fisher-Yates Shuffle mit festem Seed für Konsistenz
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
})();

// PERFORMANCE-OPTIMIERUNG: questionCategories wurde in separate Datei ausgelagert
// für besseres Code-Splitting und reduzierte initiale Bundle-Größe
// Siehe: src/data/questionCategories.js

/* Alte Definition entfernt - jetzt importiert:
const questionCategories = {
    "astronomie_geographie": {
        name: "Astronomie & Geographie",
        emoji: "🌍",
        questions: [
            { q: "Lieber Tag oder Nacht?", a: "Tag ☀️", b: "Nacht 🌙" },
            { q: "Lieber Regenwald oder Wüste?", a: "Regenwald 🌳💧", b: "Wüste 🏜️☀️" },
            { q: "Lieber Ozean oder Gebirge?", a: "Ozean 🌊", b: "Gebirge ⛰️" },
            { q: "Lieber Nordpol oder Südpol?", a: "Nordpol 🐻‍❄️", b: "Südpol 🐧" },
            { q: "Lieber Städtereise oder Naturreise?", a: "Stadt 🏙️", b: "Natur 🏞️" },
            { q: "Lieber Kontinental oder Insel?", a: "Kontinental 🗺️", b: "Insel 🏝️" },
            { q: "Lieber heiße oder kalte Klimazone?", a: "Heiß 🌞", b: "Kalt ❄️" },
            { q: "Lieber Regen oder Schnee?", a: "Regen 🌧️", b: "Schnee ❄️" },
            { q: "Lieber Sonne oder Mond beobachten?", a: "Sonne ☀️", b: "Mond 🌙" },
            { q: "Lieber Flachland oder Hochland?", a: "Flachland 🌾", b: "Hochland 🏔️" },
            { q: "Lieber Fluss oder See?", a: "Fluss 🌊", b: "See 🏞️" },
            { q: "Lieber tropisch oder gemäßigt?", a: "Tropisch 🌴", b: "Gemäßigt 🍃" },
            { q: "Lieber Meeresküste oder Seenlandschaft?", a: "Meeresküste 🌊", b: "Seenlandschaft 🏞️" },
            { q: "Lieber Vulkan oder Geysir?", a: "Vulkan 🌋", b: "Geysir 💨" },
            { q: "Lieber Regenzeit oder Trockenzeit?", a: "Regenzeit 🌧️", b: "Trockenzeit ☀️" },
            { q: "Lieber Polarlicht oder Sonnenuntergang?", a: "Polarlicht 🌌", b: "Sonnenuntergang 🌅" },
            { q: "Lieber Kontinent oder Ozean?", a: "Kontinent 🗺️", b: "Ozean 🌊" },
            { q: "Lieber Wettervorhersage oder überrascht werden?", a: "Vorhersage 📡", b: "Überraschung 🎲" },
            { q: "Lieber Höhenluft oder Meereshöhe?", a: "Höhenluft ⛰️", b: "Meereshöhe 🏖️" },
            { q: "Lieber Erdmagnetfeld oder Schwerkraft?", a: "Magnetfeld 🧲", b: "Schwerkraft ⬇️" }
        ]
    },
    "essen_trinken": {
        name: "Essen & Trinken",
        emoji: "🍽️",
        questions: [
            { q: "Lieber Butter oder Margarine?", a: "Butter 🧈", b: "Margarine 🥄" },
            { q: "Lieber Kaffee oder Tee?", a: "Kaffee ☕", b: "Tee 🍵" },
            { q: "Lieber Pizza oder Pasta?", a: "Pizza 🍕", b: "Pasta 🍝" },
            { q: "Lieber Schokolade oder Gummibärchen?", a: "Schokolade 🍫", b: "Gummibärchen 🐻" },
            { q: "Lieber Burger oder Döner?", a: "Burger 🍔", b: "Döner 🥙" },
            { q: "Lieber kochen oder bestellen?", a: "Kochen 🧑‍🍳", b: "Bestellen 🛵" },
            { q: "Lieber Vanille oder Schokoeis?", a: "Vanille 🤍🍦", b: "Schoko 🤎🍦" },
            { q: "Lieber Popcorn süß oder salzig?", a: "Süß 🍬🍿", b: "Salzig 🧂🍿" },
            { q: "Lieber Wein oder Bier?", a: "Wein 🍷", b: "Bier 🍺" },
            { q: "Lieber Käse oder Wurst?", a: "Käse 🧀", b: "Wurst 🥓" },
            { q: "Lieber Spiegelei oder Rührei?", a: "Spiegelei 🍳👁️", b: "Rührei 🥚🥣" },
            { q: "Lieber Limo oder Saft?", a: "Limo 🥤", b: "Saft 🧃" },
            { q: "Lieber Torte oder Kuchen?", a: "Torte 🎂", b: "Kuchen 🍰" },
            { q: "Lieber Ketchup oder Mayo?", a: "Ketchup 🍅", b: "Mayo 🥚" },
            { q: "Lieber Salat oder Suppe?", a: "Salat 🥗", b: "Suppe 🥣" },
            { q: "Lieber Marmelade oder Honig?", a: "Marmelade 🍓", b: "Honig 🍯" },
            { q: "Lieber Kartoffeln oder Reis?", a: "Kartoffeln 🥔", b: "Reis 🍚" },
            { q: "Lieber süß oder herzhaft frühstücken?", a: "Süß 🥞🍬", b: "Herzhaft 🥓🍳" },
            { q: "Lieber Käseplatte oder Obstteller?", a: "Käse 🧀🍇", b: "Obst 🥝🍎" },
            { q: "Lieber Apfelkuchen oder Käsekuchen?", a: "Apfelkuchen 🍎🍰", b: "Käsekuchen 🧀🍰" }
        ]
    },
    "flora_fauna": {
        name: "Flora & Fauna",
        emoji: "🌿",
        questions: [
            { q: "Lieber Hund oder Katze?", a: "Hund 🐕", b: "Katze 🐈" },
            { q: "Lieber Blumen oder Bäume?", a: "Blumen 🌸", b: "Bäume 🌳" },
            { q: "Lieber Vögel oder Fische beobachten?", a: "Vögel 🐦", b: "Fische 🐠" },
            { q: "Lieber Rosen oder Sonnenblumen?", a: "Rosen 🌹", b: "Sonnenblumen 🌻" },
            { q: "Lieber Haus- oder Wildtier?", a: "Haustier 🐕", b: "Wildtier 🦁" },
            { q: "Lieber Garten oder Wald?", a: "Garten 🌳", b: "Wald 🌲" },
            { q: "Lieber Kraut oder Blüte?", a: "Kraut 🌿", b: "Blüte 🌺" },
            { q: "Lieber Tagfalter oder Nachtfalter?", a: "Tagfalter 🦋", b: "Nachtfalter 🦋🌙" },
            { q: "Lieber Nadel- oder Laubbaum?", a: "Nadelbaum 🌲", b: "Laubbaum 🍃" },
            { q: "Lieber Säugetier oder Reptil?", a: "Säugetier 🐾", b: "Reptil 🦎" },
            { q: "Lieber Obst- oder Gemüsegarten?", a: "Obstgarten 🍎", b: "Gemüsegarten 🥕" },
            { q: "Lieber Land- oder Wassertier?", a: "Landtier 🦌", b: "Wassertier 🐙" },
            { q: "Lieber Kaktus oder Palme?", a: "Kaktus 🌵", b: "Palme 🌴" },
            { q: "Lieber kleine oder große Tiere?", a: "Klein 🐭", b: "Groß 🐘" },
            { q: "Lieber duftende oder bunte Blumen?", a: "Duftend 🌸", b: "Bunt 🌺" },
            { q: "Lieber Raub- oder Beutetier?", a: "Raubtier 🦁", b: "Beutetier 🐰" },
            { q: "Lieber heimische oder exotische Pflanzen?", a: "Heimisch 🌾", b: "Exotisch 🌴" },
            { q: "Lieber Insekten oder Spinnen?", a: "Insekten 🦗", b: "Spinnen 🕷️" },
            { q: "Lieber einjährige oder mehrjährige Pflanzen?", a: "Einjährig 🌱", b: "Mehrjährig 🌳" },
            { q: "Lieber Pflanzen pflegen oder Tiere versorgen?", a: "Pflanzen 🌿", b: "Tiere 🐕" }
        ]
    },
    "forschung_wissenschaft": {
        name: "Forschung & Wissenschaft",
        emoji: "🔬",
        questions: [
            { q: "Lieber Biologie oder Physik?", a: "Biologie 🧬", b: "Physik ⚛️" },
            { q: "Lieber Labor oder Feldversuch?", a: "Labor 🧪", b: "Feldversuch 🌍" },
            { q: "Lieber Theorie oder Praxis?", a: "Theorie 📚", b: "Praxis 🔬" },
            { q: "Lieber Mikroskop oder Teleskop?", a: "Mikroskop 🔬", b: "Teleskop 🔭" },
            { q: "Lieber Chemie oder Mathematik?", a: "Chemie ⚗️", b: "Mathematik 📐" },
            { q: "Lieber beobachten oder experimentieren?", a: "Beobachten 👁️", b: "Experimentieren ⚗️" },
            { q: "Lieber Naturwissenschaft oder Geisteswissenschaft?", a: "Naturwissenschaft 🔬", b: "Geisteswissenschaft 📖" },
            { q: "Lieber Einzelergebnis oder Durchbruch?", a: "Einzelergebnis 📊", b: "Durchbruch 💡" },
            { q: "Lieber quantitative oder qualitative Forschung?", a: "Quantitativ 📈", b: "Qualitativ 📝" },
            { q: "Lieber Astronomie oder Geologie?", a: "Astronomie 🪐", b: "Geologie 🗿" },
            { q: "Lieber Genom oder Umwelt?", a: "Genom 🧬", b: "Umwelt 🌍" },
            { q: "Lieber Hypothese oder Theorie?", a: "Hypothese 💭", b: "Theorie 📚" },
            { q: "Lieber klinische oder Grundlagenforschung?", a: "Klinisch 🏥", b: "Grundlagen 🧪" },
            { q: "Lieber Robotik oder KI?", a: "Robotik 🤖", b: "KI 🧠" },
            { q: "Lieber Entdeckung oder Erfindung?", a: "Entdeckung 🔍", b: "Erfindung 💡" },
            { q: "Lieber Mikro- oder Makroskala?", a: "Mikro 🔬", b: "Makro 🌌" },
            { q: "Lieber Langzeitstudie oder Schnelltest?", a: "Langzeit 📅", b: "Schnelltest ⚡" },
            { q: "Lieber Teamforschung oder Einzelforschung?", a: "Team 👥", b: "Einzel 🧑‍🔬" },
            { q: "Lieber Datenanalyse oder Datensammlung?", a: "Analyse 📊", b: "Sammlung 📦" },
            { q: "Lieber publizieren oder forschen?", a: "Publizieren 📄", b: "Forschen 🔬" }
        ]
    },
    "geschichte_politik": {
        name: "Geschichte & Politik",
        emoji: "🏛️",
        questions: [
            { q: "Lieber Antike oder Moderne?", a: "Antike 🏛️", b: "Moderne 🏙️" },
            { q: "Lieber Monarchie oder Republik?", a: "Monarchie 👑", b: "Republik 🗳️" },
            { q: "Lieber lokale oder Weltgeschichte?", a: "Lokal 🏘️", b: "Welt 🌍" },
            { q: "Lieber Krieg oder Frieden?", a: "Krieg ⚔️", b: "Frieden 🕊️" },
            { q: "Lieber Revolution oder Evolution?", a: "Revolution 🔥", b: "Evolution 📈" },
            { q: "Lieber Demokratie oder Diktatur?", a: "Demokratie 🗳️", b: "Diktatur 🚫" },
            { q: "Lieber geschichtliche Dokumente oder mündliche Überlieferung?", a: "Dokumente 📜", b: "Mündlich 🗣️" },
            { q: "Lieber Imperium oder Stadtstaat?", a: "Imperium 🌍", b: "Stadtstaat 🏛️" },
            { q: "Lieber Vergangenheit oder Zukunft?", a: "Vergangenheit ⏮️", b: "Zukunft ⏭️" },
            { q: "Lieber Wirtschafts- oder Kulturpolitik?", a: "Wirtschaft 💼", b: "Kultur 🎭" },
            { q: "Lieber Nationalismus oder Globalismus?", a: "Nationalismus 🇩🇪", b: "Globalismus 🌐" },
            { q: "Lieber Konservativ oder Progressiv?", a: "Konservativ 📜", b: "Progressiv 🚀" },
            { q: "Lieber historische Persönlichkeit oder Ereignis?", a: "Persönlichkeit 👤", b: "Ereignis 📅" },
            { q: "Lieber Innen- oder Außenpolitik?", a: "Innenpolitik 🏠", b: "Außenpolitik 🌍" },
            { q: "Lieber Wahl oder Revolution?", a: "Wahl 🗳️", b: "Revolution 🔥" },
            { q: "Lieber Tradition oder Innovation?", a: "Tradition 📜", b: "Innovation 💡" },
            { q: "Lieber Friedensvertrag oder Handelsabkommen?", a: "Friedensvertrag ✍️", b: "Handelsabkommen 🤝" },
            { q: "Lieber historischer Roman oder Dokumentation?", a: "Roman 📚", b: "Dokumentation 🎥" },
            { q: "Lieber Regierung oder Opposition?", a: "Regierung 🏛️", b: "Opposition 🎤" },
            { q: "Lieber Geschichtsbuch oder Museum?", a: "Buch 📖", b: "Museum 🏛️" }
        ]
    },
    "glaube_religion": {
        name: "Glaube & Religion",
        emoji: "🙏",
        questions: [
            { q: "Lieber Glaube oder Wissen?", a: "Glaube 🙏", b: "Wissen 📚" },
            { q: "Lieber Gebet oder Meditation?", a: "Gebet 🙏", b: "Meditation 🧘" },
            { q: "Lieber Kirche oder Natur?", a: "Kirche ⛪", b: "Natur 🌳" },
            { q: "Lieber religiöser Text oder spirituelle Erfahrung?", a: "Text 📖", b: "Erfahrung ✨" },
            { q: "Lieber Gemeinschaft oder Einzelgänger?", a: "Gemeinschaft 👥", b: "Einzel 🙏" },
            { q: "Lieber Ritual oder spontan?", a: "Ritual 🔔", b: "Spontan 💫" },
            { q: "Lieber Tradition oder Modernität?", a: "Tradition 📜", b: "Modernität 🌟" },
            { q: "Lieber Philosophie oder Theologie?", a: "Philosophie 💭", b: "Theologie 📖" },
            { q: "Lieber feste Überzeugung oder offene Fragen?", a: "Überzeugung 💪", b: "Offen 🤔" },
            { q: "Lieber Gott oder Universum?", a: "Gott 👼", b: "Universum 🌌" },
            { q: "Lieber Predigt oder Stille?", a: "Predigt 🗣️", b: "Stille 🤫" },
            { q: "Lieber heiliger Ort oder überall?", a: "Heiliger Ort ⛪", b: "Überall 🌍" },
            { q: "Lieber Dogma oder Toleranz?", a: "Dogma 📜", b: "Toleranz 🤝" },
            { q: "Lieber Religion oder Spiritualität?", a: "Religion ⛪", b: "Spiritualität ✨" },
            { q: "Lieber Gemeindeleben oder Privatheit?", a: "Gemeinde 👥", b: "Privat 🙏" },
            { q: "Lieber geschriebenes Gesetz oder Gewissen?", a: "Gesetz 📜", b: "Gewissen ❤️" },
            { q: "Lieber Priester oder Laie?", a: "Priester 👨‍💼", b: "Laie 👤" },
            { q: "Lieber heilige Schrift oder persönliche Offenbarung?", a: "Schrift 📖", b: "Offenbarung 💡" },
            { q: "Lieber Festtag oder Alltag?", a: "Festtag 🎉", b: "Alltag 📅" },
            { q: "Lieber Transzendenz oder Immanenz?", a: "Transzendenz 🌌", b: "Immanenz 🌍" }
        ]
    },
    "kunst_kultur": {
        name: "Kunst & Kultur",
        emoji: "🎨",
        questions: [
            { q: "Lieber Malerei oder Skulptur?", a: "Malerei 🖼️", b: "Skulptur 🗿" },
            { q: "Lieber abstrakt oder figurativ?", a: "Abstrakt 🎨", b: "Figurativ 👤" },
            { q: "Lieber Museum oder Galerie?", a: "Museum 🏛️", b: "Galerie 🖼️" },
            { q: "Lieber klassisch oder modern?", a: "Klassisch 🎭", b: "Modern 🎨" },
            { q: "Lieber Farbe oder Form?", a: "Farbe 🌈", b: "Form ⬜" },
            { q: "Lieber Original oder Reproduktion?", a: "Original ✨", b: "Reproduktion 📋" },
            { q: "Lieber Künstler oder Betrachter?", a: "Künstler 🎨", b: "Betrachter 👁️" },
            { q: "Lieber Öl- oder Aquarellmalerei?", a: "Öl 🖌️", b: "Aquarell 💧" },
            { q: "Lieber Renaissance oder Barock?", a: "Renaissance 🎭", b: "Barock 🏛️" },
            { q: "Lieber Street Art oder Museumskunst?", a: "Street Art 🎨", b: "Museumskunst 🖼️" },
            { q: "Lieber Porträt oder Landschaft?", a: "Porträt 👤", b: "Landschaft 🌄" },
            { q: "Lieber Fotografie oder Gemälde?", a: "Fotografie 📸", b: "Gemälde 🖼️" },
            { q: "Lieber Installation oder Performance?", a: "Installation 🎭", b: "Performance 🎪" },
            { q: "Lieber Realismus oder Surrealismus?", a: "Realismus 👁️", b: "Surrealismus 🌈" },
            { q: "Lieber minimal oder opulent?", a: "Minimal ⬜", b: "Opulent ✨" },
            { q: "Lieber analog oder digital?", a: "Analog 🖌️", b: "Digital 💻" },
            { q: "Lieber Tradition oder Avantgarde?", a: "Tradition 📜", b: "Avantgarde 🚀" },
            { q: "Lieber Einzelwerk oder Serie?", a: "Einzelwerk 🖼️", b: "Serie 📚" },
            { q: "Lieber Gemälde oder Zeichnung?", a: "Gemälde 🎨", b: "Zeichnung ✏️" },
            { q: "Lieber Künstlerkollektiv oder Einzelkünstler?", a: "Kollektiv 👥", b: "Einzelkünstler 🎨" }
        ]
    },
    "literatur_sprache": {
        name: "Literatur & Sprache",
        emoji: "📚",
        questions: [
            { q: "Lieber Buch oder Hörbuch?", a: "Buch 📚", b: "Hörbuch 🎧" },
            { q: "Lieber Roman oder Gedicht?", a: "Roman 📖", b: "Gedicht ✍️" },
            { q: "Lieber Fiktion oder Non-Fiktion?", a: "Fiktion 🎭", b: "Non-Fiktion 📊" },
            { q: "Lieber Schreiber oder Leser?", a: "Schreiber ✍️", b: "Leser 👁️" },
            { q: "Lieber gedruckt oder digital?", a: "Gedruckt 📖", b: "Digital 📱" },
            { q: "Lieber Fantasy oder Realismus?", a: "Fantasy 🐉", b: "Realismus 👁️" },
            { q: "Lieber Kurzgeschichte oder Roman?", a: "Kurzgeschichte 📝", b: "Roman 📖" },
            { q: "Lieber Übersetzen oder Original?", a: "Übersetzen 🌐", b: "Original 📚" },
            { q: "Lieber Gedicht schreiben oder lesen?", a: "Schreiben ✍️", b: "Lesen 👁️" },
            { q: "Lieber Drama oder Komödie?", a: "Drama 🎭", b: "Komödie 😂" },
            { q: "Lieber Autor oder Kritiker?", a: "Autor ✍️", b: "Kritiker 📝" },
            { q: "Lieber Bibliothek oder Buchhandlung?", a: "Bibliothek 📚", b: "Buchhandlung 🏪" },
            { q: "Lieber Klassiker oder Bestseller?", a: "Klassiker 📜", b: "Bestseller 🔥" },
            { q: "Lieber Poesie oder Prosa?", a: "Poesie ✍️", b: "Prosa 📖" },
            { q: "Lieber Muttersprache oder Fremdsprache?", a: "Muttersprache 🇩🇪", b: "Fremdsprache 🌍" },
            { q: "Lieber Erzähler oder Zuhörer?", a: "Erzähler 🗣️", b: "Zuhörer 👂" },
            { q: "Lieber Brief oder E-Mail?", a: "Brief ✉️", b: "E-Mail 📧" },
            { q: "Lieber Tagebuch oder Blog?", a: "Tagebuch 📔", b: "Blog 💻" },
            { q: "Lieber Lyrik oder Epik?", a: "Lyrik ✍️", b: "Epik 📖" },
            { q: "Lieber Wort oder Bild?", a: "Wort 📝", b: "Bild 🖼️" }
        ]
    },
    "medien_unterhaltung": {
        name: "Medien & Unterhaltung",
        emoji: "📺",
        questions: [
            { q: "Lieber Film oder Serie?", a: "Film 🎬", b: "Serie 📺" },
            { q: "Lieber Netflix oder YouTube?", a: "Netflix 🟥", b: "YouTube ▶️" },
            { q: "Lieber Kino oder zu Hause?", a: "Kino 🎬", b: "Zuhause 📺" },
            { q: "Lieber Action oder Drama?", a: "Action 💥", b: "Drama 🎭" },
            { q: "Lieber Comedy oder Thriller?", a: "Comedy 😂", b: "Thriller 🕵️" },
            { q: "Lieber Live-TV oder Streaming?", a: "Live-TV 📡", b: "Streaming 📱" },
            { q: "Lieber Dokumentation oder Spielfilm?", a: "Dokumentation 📹", b: "Spielfilm 🎬" },
            { q: "Lieber Originalsprache oder Synchronisation?", a: "Original 🗣️", b: "Synchronisation 🎤" },
            { q: "Lieber Kurzfilm oder Langfilm?", a: "Kurzfilm ⏱️", b: "Langfilm ⏰" },
            { q: "Lieber Schwarz-Weiß oder Farbe?", a: "Schwarz-Weiß ⚫⚪", b: "Farbe 🌈" },
            { q: "Lieber Realität oder Fiktion?", a: "Realität 👁️", b: "Fiktion 🎭" },
            { q: "Lieber Single-Player oder Multiplayer?", a: "Single 🎮", b: "Multiplayer 👥" },
            { q: "Lieber Actionspiel oder Strategiespiel?", a: "Action 💥", b: "Strategie 🧠" },
            { q: "Lieber Konsole oder PC?", a: "Konsole 🎮", b: "PC 💻" },
            { q: "Lieber Videospiele spielen oder Brettspiele?", a: "Video 🎮", b: "Brett 🎲" },
            { q: "Lieber Kabel oder Streaming?", a: "Kabel 📺", b: "Streaming 📱" },
            { q: "Lieber Neuerscheinung oder Klassiker?", a: "Neu 🆕", b: "Klassiker ⭐" },
            { q: "Lieber Fernseher oder Projektor?", a: "Fernseher 📺", b: "Projektor 🎬" },
            { q: "Lieber Reality-TV oder Scripted?", a: "Reality 📺", b: "Scripted 📝" },
            { q: "Lieber Binge-Watching oder wöchentlich?", a: "Binge 🍿", b: "Wöchentlich 📅" }
        ]
    },
    "musik": {
        name: "Musik",
        emoji: "🎵",
        questions: [
            { q: "Lieber Rock oder Pop?", a: "Rock 🎸", b: "Pop 🎤" },
            { q: "Lieber laut oder leise Musik hören?", a: "Laut 🔊🎶", b: "Leise 🤫🎧" },
            { q: "Lieber Musik mit oder ohne Text?", a: "Mit Text 🗣️🎵", b: "Instrumental 🎼🎧" },
            { q: "Lieber Live-Konzert oder Studioaufnahme?", a: "Live 🎤", b: "Studio 🎧" },
            { q: "Lieber Sänger oder Instrumentalist?", a: "Sänger 🎤", b: "Instrumentalist 🎸" },
            { q: "Lieber Klassik oder Moderne?", a: "Klassik 🎻", b: "Moderne 🎸" },
            { q: "Lieber Gitarre oder Klavier?", a: "Gitarre 🎸", b: "Klavier 🎹" },
            { q: "Lieber allein oder in der Band?", a: "Allein 🎤", b: "Band 👥" },
            { q: "Lieber Kopfhörer oder Lautsprecher?", a: "Kopfhörer 🎧", b: "Lautsprecher 🔊" },
            { q: "Lieber Vinyl oder Digital?", a: "Vinyl 💿", b: "Digital 📱" },
            { q: "Lieber Songwriter oder Interprete?", a: "Songwriter ✍️", b: "Interprete 🎤" },
            { q: "Lieber Jazz oder Electronic?", a: "Jazz 🎷", b: "Electronic 🎹" },
            { q: "Lieber Festival oder Intimkonzert?", a: "Festival 🎪", b: "Intim 🎵" },
            { q: "Lieber Refrain oder Bridge?", a: "Refrain 🎵", b: "Bridge 🌉" },
            { q: "Lieber Musik machen oder hören?", a: "Machen 🎸", b: "Hören 🎧" },
            { q: "Lieber Akustik oder Elektrik?", a: "Akustik 🎸", b: "Elektrik ⚡" },
            { q: "Lieber Cover oder Original?", a: "Cover 🎵", b: "Original ✨" },
            { q: "Lieber Album oder Single?", a: "Album 💿", b: "Single 🎵" },
            { q: "Lieber Rhythmus oder Melodie?", a: "Rhythmus 🥁", b: "Melodie 🎵" },
            { q: "Lieber Bar oder Club?", a: "Bar 🍸", b: "Club 🎶" }
        ]
    },
    "sport": {
        name: "Sport",
        emoji: "⚽",
        questions: [
            { q: "Lieber Sport im Team oder allein?", a: "Team ⚽", b: "Allein 🏃‍♀️" },
            { q: "Lieber Sport gucken oder selber machen?", a: "Gucken 🏟️👀", b: "Machen 🤸‍♂️💪" },
            { q: "Lieber morgens oder abends trainieren?", a: "Morgens 🌅🏃", b: "Abends 🌙💪" },
            { q: "Lieber Laufen oder Schwimmen?", a: "Laufen 🏃", b: "Schwimmen 🏊" },
            { q: "Lieber Fußball oder Basketball?", a: "Fußball ⚽", b: "Basketball 🏀" },
            { q: "Lieber Indoor oder Outdoor?", a: "Indoor 🏠", b: "Outdoor 🌳" },
            { q: "Lieber Ausdauer oder Kraft?", a: "Ausdauer 🏃", b: "Kraft 💪" },
            { q: "Lieber Wettkampf oder Training?", a: "Wettkampf 🏆", b: "Training 💪" },
            { q: "Lieber Mannschaft oder Einzelsport?", a: "Mannschaft 👥", b: "Einzel 🏃" },
            { q: "Lieber Tennis oder Badminton?", a: "Tennis 🎾", b: "Badminton 🏸" },
            { q: "Lieber Radfahren oder Wandern?", a: "Radfahren 🚲🌳", b: "Wandern 🚶‍♀️🏔️" },
            { q: "Lieber Gym oder Natur?", a: "Gym 🏋️", b: "Natur 🌲" },
            { q: "Lieber Profi oder Amateur?", a: "Profi 🏆", b: "Amateur 🎯" },
            { q: "Lieber Sieg oder Spaß?", a: "Sieg 🏆", b: "Spaß 😊" },
            { q: "Lieber Sommer- oder Wintersport?", a: "Sommer ☀️", b: "Winter ❄️" },
            { q: "Lieber Kontaktsport oder Nicht-Kontakt?", a: "Kontakt 🤼", b: "Nicht-Kontakt 🏃" },
            { q: "Lieber Sprint oder Marathon?", a: "Sprint ⚡", b: "Marathon 🏃" },
            { q: "Lieber Ball- oder Rückschlagsport?", a: "Ball ⚽", b: "Rückschlag 🎾" },
            { q: "Lieber Sportartikel oder natürliche Bewegung?", a: "Artikel 🎾", b: "Natürlich 🏃" },
            { q: "Lieber Tageszeitung oder Sport-App?", a: "Zeitung 📰", b: "App 📱" }
        ]
    },
    "technik_wirtschaft": {
        name: "Technik & Wirtschaft",
        emoji: "💻",
        questions: [
            { q: "Lieber Apple oder Android?", a: "Apple 🍎", b: "Android 🤖" },
            { q: "Lieber Smartphone oder Laptop?", a: "Smartphone 📱", b: "Laptop 💻" },
            { q: "Lieber Bargeld oder Karte?", a: "Bargeld 💵", b: "Karte 💳" },
            { q: "Lieber Auto oder Bahn?", a: "Auto 🚗", b: "Bahn 🚂" },
            { q: "Lieber Schreibtisch oder Homeoffice?", a: "Büro 🏢", b: "Homeoffice 🏡" },
            { q: "Lieber WhatsApp oder Anruf?", a: "WhatsApp 💬", b: "Anruf 📞" },
            { q: "Lieber online shoppen oder im Laden?", a: "Online 🛒💻", b: "Im Laden 🛍️🚶" },
            { q: "Lieber Aktien oder Immobilien?", a: "Aktien 📈", b: "Immobilien 🏠" },
            { q: "Lieber Start-up oder Konzern?", a: "Start-up 🚀", b: "Konzern 🏢" },
            { q: "Lieber Innovation oder Stabilität?", a: "Innovation 💡", b: "Stabilität 📊" },
            { q: "Lieber Cloud oder lokal?", a: "Cloud ☁️", b: "Lokal 💾" },
            { q: "Lieber Kryptowährung oder Fiat?", a: "Krypto ₿", b: "Fiat 💵" },
            { q: "Lieber Automatisierung oder Handarbeit?", a: "Automatisierung 🤖", b: "Handarbeit ✋" },
            { q: "Lieber Ökonomie oder Ökologie?", a: "Ökonomie 💼", b: "Ökologie 🌿" },
            { q: "Lieber B2B oder B2C?", a: "B2B 💼", b: "B2C 🛒" },
            { q: "Lieber Offline oder Online?", a: "Offline 📴", b: "Online 🌐" },
            { q: "Lieber Freelancer oder Angestellter?", a: "Freelancer 🆓", b: "Angestellter 💼" },
            { q: "Lieber Kredit oder Sparen?", a: "Kredit 💳", b: "Sparen 💰" },
            { q: "Lieber Risiko oder Sicherheit?", a: "Risiko 🎲", b: "Sicherheit 🔒" },
            { q: "Lieber einmal viel Geld oder jeden Tag ein bisschen?", a: "Einmal viel 💰💥", b: "Jeden Tag etwas 💸🗓️" }
        ]
    },
    "diverses": {
        name: "Diverses",
        emoji: "🎲",
        questions: [
            { q: "Lieber Sommer oder Winter?", a: "Sommer ☀️", b: "Winter ❄️" },
            { q: "Lieber Urlaub am Strand oder in den Bergen?", a: "Strand 🏖️", b: "Berge ⛰️" },
            { q: "Lieber Frühaufsteher oder Langschläfer?", a: "Früh ⏰☀️", b: "Spät 🌙💤" },
            { q: "Lieber Sneaker oder Stiefel?", a: "Sneaker 👟", b: "Stiefel 👢" },
            { q: "Lieber Holz- oder Metallmöbel?", a: "Holz 🪵", b: "Metall 🔩" },
            { q: "Lieber Jeans oder Stoffhose?", a: "Jeans 👖", b: "Stoffhose 🩳" },
            { q: "Lieber drinnen oder draußen feiern?", a: "Drinnen 🏠🎉", b: "Draußen 🌳🥳" },
            { q: "Lieber Socken an oder barfuß?", a: "Socken an 🧦", b: "Barfuß 🦶" },
            { q: "Lieber Couch oder Sessel?", a: "Couch 🛋️", b: "Sessel 🪑" },
            { q: "Lieber Stadt oder Land?", a: "Stadt 🏙️", b: "Land 🏞️" },
            { q: "Lieber Meer oder See?", a: "Meer 🌊", b: "See 🏞️💧" },
            { q: "Lieber Frühling oder Herbst?", a: "Frühling 🌷", b: "Herbst 🍂" },
            { q: "Lieber aufstehen oder liegen bleiben?", a: "Aufstehen 🚶‍♀️", b: "Liegen 🛌" },
            { q: "Lieber Bleistift oder Kugelschreiber?", a: "Bleistift ✏️", b: "Kugelschreiber 🖊️" },
            { q: "Lieber Feste planen oder spontan sein?", a: "Planen 🗓️", b: "Spontan 🎉" },
            { q: "Lieber Duschgel oder Seife?", a: "Duschgel 🧴", b: "Seife 🧼" },
            { q: "Lieber drinnen lesen oder draußen spazieren?", a: "Drinnen lesen 📖🏠", b: "Draußen spazieren 🚶‍♂️🌲" },
            { q: "Lieber Zelt oder Hotel?", a: "Zelt ⛺", b: "Hotel 🏨" },
            { q: "Lieber Nachrichten lesen oder hören?", a: "Lesen 📰👀", b: "Hören 📻👂" },
            { q: "Lieber Kerzenlicht oder helles Licht?", a: "Kerzenlicht 🔥🕯️", b: "Helles Licht 💡✨" },
            { q: "Lieber kurze oder lange Haare?", a: "Kurz 💇‍♀️✂️", b: "Lang 👱‍♀️🦒" },
            { q: "Lieber Ananas auf Pizza: Ja oder Nein?", a: "Ananas: Ja 🍍🍕👍", b: "Ananas: Nein 🍍🍕👎" },
            { q: "Lieber Stille oder Hintergrundgeräusche beim Arbeiten?", a: "Stille 🤫🔇", b: "Hintergrund 🎧🎵" },
            { q: "Lieber Bleistift oder Marker?", a: "Bleistift ✏️", b: "Marker 🖍️" },
            { q: "Lieber Eis im Becher oder in der Waffel?", a: "Becher 🍨", b: "Waffel 🍦" },
            { q: "Lieber am Fenster sitzen oder am Gang (Flugzeug/Bahn)?", a: "Fenster 🖼️", b: "Gang 🚪" },
            { q: "Lieber eine saubere, leere Wohnung oder eine unordentliche, gemütliche?", a: "Sauber & Leer ✨📦", b: "Unordentlich & Gemütlich 🛋️😌" },
            { q: "Lieber Kissen weich oder hart?", a: "Weich ☁️", b: "Hart 🧱" },
            { q: "Lieber ein Leben lang nur noch Toast oder nur noch Brötchen essen?", a: "Toast 🍞", b: "Brötchen 🥐" },
            { q: "Lieber in der ersten oder letzten Reihe sitzen (Kino/Theater)?", a: "Erste Reihe 🥇", b: "Letzte Reihe 🔚" },
            { q: "Lieber Marmelade oder Nutella?", a: "Marmelade 🍓", b: "Nutella 🍫" },
            { q: "Lieber warm oder kalt trinken?", a: "Warm ♨️☕", b: "Kalt 🧊🥤" },
            { q: "Lieber Fleisch oder Fisch?", a: "Fleisch 🥩", b: "Fisch 🐟" },
            { q: "Lieber Süßkartoffel oder normale Kartoffel?", a: "Süß 🍠", b: "Normal 🥔" },
            { q: "Lieber Hemd oder T-Shirt?", a: "Hemd 👔", b: "T-Shirt 👕" },
            { q: "Lieber im Hotel frühstücken oder im Café?", a: "Hotel 🏨🍳", b: "Café ☕🥐" },
            { q: "Lieber Scharf oder Mild essen?", a: "Scharf 🌶️🔥", b: "Mild 🥛😌" },
            { q: "Lieber E-Book oder gedrucktes Buch?", a: "E-Book 📱📚", b: "Gedruckt 📖🌳" },
            { q: "Lieber mit öffentlichen Verkehrsmitteln oder mit dem Rad zur Arbeit?", a: "Öffentlich 🚌🚆", b: "Fahrrad 🚲" },
            { q: "Lieber Rotwein oder Weißwein?", a: "Rotwein 🍷🔴", b: "Weißwein 🥂⚪" },
            { q: "Lieber in der Küche oder im Wohnzimmer essen?", a: "Küche 🧑‍🍳🍽️", b: "Wohnzimmer 🛋️📺" },
            { q: "Lieber Salzgebäck oder Chips?", a: "Salzgebäck 🥨", b: "Chips 🥔💸" },
            { q: "Lieber schreiben oder lesen?", a: "Schreiben ✍️", b: "Lesen 📖" },
            { q: "Lieber Krawatte oder Fliege?", a: "Krawatte 👔", b: "Fliege 🎀" },
            { q: "Lieber glatt oder lockig?", a: "Glatt 💇‍♀️📏", b: "Lockig 💆‍♀️🌀" },
            { q: "Lieber Taschenlampe oder Kerze?", a: "Taschenlampe 🔦", b: "Kerze 🕯️" },
            { q: "Lieber nur noch Gemüse oder nur noch Obst essen?", a: "Gemüse 🥦🥬", b: "Obst 🍎🍊" },
            { q: "Lieber nur noch Mützen oder nur noch Schals tragen?", a: "Mützen 🧢👒", b: "Schals 🧣🧣" },
            { q: "Lieber immer pünktlich oder immer gute Laune?", a: "Pünktlich ⏰✅", b: "Gute Laune 😄🥳" },
            { q: "Lieber Suppe mit Einlage oder pur?", a: "Mit Einlage 🍜🍲", b: "Pur 🥣💧" },
            { q: "Lieber Süßigkeiten im Kühlschrank oder ungekühlt?", a: "Kalt 🧊🍬", b: "Zimmerwarm 🌡️🍭" },
            { q: "Lieber auf dem Bauch oder auf der Seite schlafen?", a: "Bauch ⬇️🛌", b: "Seite ↪️😴" },
            { q: "Lieber Jeans mit Löchern oder ohne?", a: "Mit Löchern 👖🕳️", b: "Ohne Löcher 👖✨" },
            { q: "Lieber weiße oder bunte Wäsche?", a: "Weiße ⚪🧺", b: "Bunte 🌈👕" },
            { q: "Lieber Nudeln al dente oder weich?", a: "Al Dente 👌🍝", b: "Weich 😴🍜" },
            { q: "Lieber Füller oder Kugelschreiber?", a: "Füller 🖋️✨", b: "Kugelschreiber 🖊️💪" },
            { q: "Lieber Städtetrip oder Wellness?", a: "Städtetrip 🏙️", b: "Wellness 🧘‍♀️" },
            { q: "Lieber duschen oder baden?", a: "Duschen 🚿", b: "Baden 🛁" }
        ]
    }
}; */

// PERFORMANCE-OPTIMIERUNG: getAllQuestions wurde in separate Datei ausgelagert
// Siehe: src/data/questionCategories.js

function App() {
    // Firebase
    const [app, setApp] = useState(null)
    const [db, setDb] = useState(null)
    
    // State
    const [currentScreen, setCurrentScreen] = useState('landing')
    const [myName, setMyName] = useState(sessionStorage.getItem("hk_name") || "")
    const [myEmoji, setMyEmoji] = useState(sessionStorage.getItem("hk_emoji") || availableEmojis[Math.floor(availableEmojis.length / 2)])
    const [roomId, setRoomId] = useState(sessionStorage.getItem("hk_room") || "")
    const [isHost, setIsHost] = useState(false)
    const [globalData, setGlobalData] = useState(null)
    
    // Start Screen
    const [showHostSettings, setShowHostSettings] = useState(false)
    const [showJoinPanel, setShowJoinPanel] = useState(false)
    const [gameMode, setGameMode] = useState('party')
    const [selectedCategories, setSelectedCategories] = useState([])
    const [roomPassword, setRoomPassword] = useState("")
    const [roomCode, setRoomCode] = useState("")
    const [joinPassword, setJoinPassword] = useState("")
    const [roomList, setRoomList] = useState([])
    
    // Game Screen
    const [mySelection, setMySelection] = useState(null)
    const [myStrategy, setMyStrategy] = useState(null)
    const [localActionDone, setLocalActionDone] = useState(false)
    const [lastRoundId, setLastRoundId] = useState(null)
    const [lastAttackResultKey, setLastAttackResultKey] = useState(null)
    const [isOpeningAttackModal, setIsOpeningAttackModal] = useState(false)
    
    // Reward/Attack Selection States (Strategic Mode)
    const [showRewardChoice, setShowRewardChoice] = useState(false)
    const [showAttackSelection, setShowAttackSelection] = useState(false)
    const [showJokerShop, setShowJokerShop] = useState(false)
    
    // Modals
    const [showHotseatModal, setShowHotseatModal] = useState(false)
    const [showAttackModal, setShowAttackModal] = useState(false)
    const [showRulesModal, setShowRulesModal] = useState(false)
    const [attackResult, setAttackResult] = useState(null)
    const [countdownText, setCountdownText] = useState(null)
    const [showCountdown, setShowCountdown] = useState(false)
    
    // Menu
    const [menuOpen, setMenuOpen] = useState(false)
    
    // Countdown-Interval für Countdown-Animation
    useEffect(() => {
        if (!showCountdown || !globalData?.countdownEnds) return
        
        const countdownEnds = globalData.countdownEnds
        const updateCountdown = () => {
            const remainingMs = countdownEnds - Date.now()
            const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
            if (seconds > 0) {
                setCountdownText(seconds.toString())
            } else {
                setCountdownText('HITZ\nKOPF!')
                setTimeout(() => {
                    setShowCountdown(false)
                    setCountdownText(null)
                }, 1000)
            }
        }
        
        updateCountdown()
        const interval = setInterval(() => {
            const remainingMs = countdownEnds - Date.now()
            if (remainingMs <= 0) {
                clearInterval(interval)
                setShowCountdown(false)
                setCountdownText(null)
            } else {
                updateCountdown()
            }
        }, 100)
        
        return () => clearInterval(interval)
    }, [showCountdown, globalData?.countdownEnds])
    
    // Firebase Initialisierung
    useEffect(() => {
        const firebaseApp = initializeApp(firebaseConfig)
        const firestoreDb = getFirestore(firebaseApp)
        setApp(firebaseApp)
        setDb(firestoreDb)
    }, [])
    
    // Firebase Listener - Aktualisiert alle States basierend auf Firebase-Änderungen
    useEffect(() => {
        if (!db || !roomId) return
        
        // WICHTIG: Speichere alle Timeout-IDs für Cleanup
        const timeoutIds = []
        
        const unsubscribe = onSnapshot(doc(db, "lobbies", roomId), (snapshot) => {
            if (!snapshot.exists()) {
                // Lobby existiert nicht mehr
                console.log('🚨 [FIREBASE] Lobby existiert nicht mehr, zurück zum Start')
                sessionStorage.removeItem("hk_room")
                setRoomId("")
                setGlobalData(null)
                setCurrentScreen('start')
                return
            }
            
            const data = snapshot.data()
            
            // WICHTIG: Prüfe ob sich wirklich wichtige Daten geändert haben, bevor wir States aktualisieren
            // Das verhindert unnötige Re-Renders und "Neuladen"-Effekte
            const oldStatus = globalData?.status
            const newStatus = data.status
            const oldRoundId = globalData?.roundId
            const newRoundId = data.roundId
            const oldHotseat = globalData?.hotseat
            const newHotseat = data.hotseat
            
            // Log alle wichtigen Daten-Änderungen
            const oldVotes = globalData?.votes || {}
            const newVotes = data.votes || {}
            const votesChanged = JSON.stringify(oldVotes) !== JSON.stringify(newVotes)
            
            if (votesChanged) {
                console.log('🗳️ [VOTES] Votes geändert:', {
                    roundId: data.roundId,
                    oldVotes: Object.keys(oldVotes),
                    newVotes: Object.keys(newVotes),
                    oldVotesData: oldVotes,
                    newVotesData: newVotes
                })
            }
            
            // Aktualisiere isHost basierend auf Daten
            const newIsHost = data.host === myName
            if (newIsHost !== isHost) {
                console.log('👑 [HOST] Host-Status geändert:', newIsHost ? 'Ich bin jetzt Host' : 'Ich bin kein Host mehr')
            }
            setIsHost(newIsHost)
            
            if (oldStatus !== newStatus) {
                console.log('📊 [STATUS] Status-Wechsel:', oldStatus, '→', newStatus, '| RoundId:', newRoundId)
            }
            if (oldHotseat !== newHotseat) {
                console.log('🎯 [HOTSEAT] Hotseat geändert:', oldHotseat, '→', newHotseat, '| RoundId:', newRoundId)
            }
            if (oldRoundId !== newRoundId) {
                console.log('🔄 [ROUND] Neue Runde:', oldRoundId, '→', newRoundId)
            }
            
            // WICHTIG: Setze globalData nur wenn sich wirklich etwas geändert hat
            // PERFORMANCE-FIX: Verwende shallow comparison statt JSON.stringify für große Objekte
            // JSON.stringify ist sehr teuer bei großen Objekten und kann zu Performance-Problemen führen
            let dataChanged = false
            if (!globalData) {
                dataChanged = true
            } else {
                // Prüfe nur wichtige Felder statt des gesamten Objekts
                const importantFields = ['status', 'roundId', 'hotseat', 'countdownEnds', 'roundRecapShown']
                dataChanged = importantFields.some(field => globalData[field] !== data[field]) ||
                             JSON.stringify(globalData.votes || {}) !== JSON.stringify(data.votes || {}) ||
                             JSON.stringify(globalData.players || {}) !== JSON.stringify(data.players || {}) ||
                             JSON.stringify(globalData.ready || []) !== JSON.stringify(data.ready || [])
            }
            
            if (dataChanged || !globalData) {
                setGlobalData(data)
            }
            
            // Screen-Wechsel basierend auf Status
            if (data.status === 'lobby') {
                if (currentScreen !== 'lobby') {
                    console.log('🏠 [SCREEN] Wechsel zu Lobby')
                }
                setCurrentScreen('lobby')
            } else if (data.status === 'countdown') {
                if (currentScreen !== 'lobby') {
                    console.log('⏳ [SCREEN] Wechsel zu Countdown (Lobby)')
                }
                setCurrentScreen('lobby') // Countdown wird in Lobby angezeigt
                
                // Countdown-Animation starten
                if (data.countdownEnds && !showCountdown) {
                    setShowCountdown(true)
                } else if (!data.countdownEnds && showCountdown) {
                    // Countdown beendet
                    setShowCountdown(false)
                    setCountdownText(null)
                }
            } else if (data.status === 'game') {
                if (currentScreen !== 'game') {
                    console.log('🎮 [SCREEN] Wechsel zu Game | RoundId:', data.roundId, '| Hotseat:', data.hotseat)
                }
                setCurrentScreen('game')
                
                // WICHTIG: Prüfe ob sich nur votes geändert haben (nicht roundId, status, etc.)
                // Wenn nur andere Votes geändert wurden, überspringe die Selection-Logik komplett
                const onlyVotesChanged = globalData && 
                    globalData.status === data.status &&
                    globalData.roundId === data.roundId &&
                    globalData.hotseat === data.hotseat &&
                    JSON.stringify({...globalData, votes: {}}) === JSON.stringify({...data, votes: {}}) &&
                    globalData.votes?.[myName]?.choice === data.votes?.[myName]?.choice
                
                // WICHTIG: Prüfe auch, ob globalData noch nicht gesetzt ist, aber roundId gleich lastRoundId ist
                // Das verhindert, dass mySelection zurückgesetzt wird, wenn globalData beim ersten Mal undefined ist
                const isInitialLoad = !globalData && lastRoundId === data.roundId
                
                if (onlyVotesChanged || isInitialLoad) {
                    // Nur andere Votes haben sich geändert ODER es ist der erste Load mit gleicher Runde
                    console.log('🎮 [GAME SCREEN] Nur andere Votes geändert oder Initial-Load, überspringe Selection-Logik:', {
                        mySelection: mySelection,
                        myVote: data.votes?.[myName]?.choice,
                        otherVotes: Object.keys(data.votes || {}).filter(v => v !== myName),
                        onlyVotesChanged: onlyVotesChanged,
                        isInitialLoad: isInitialLoad,
                        lastRoundId: lastRoundId,
                        currentRoundId: data.roundId
                    })
                    // WICHTIG: Behalte mySelection unverändert!
                    // Überspringe den Rest der Game-Screen-Logik
                } else {
                
                console.log('🎮 [GAME SCREEN] Game-Screen Update:', {
                    roundId: data.roundId,
                    oldRoundId: globalData?.roundId,
                    hotseat: data.hotseat,
                    myVote: data.votes?.[myName],
                    allVotes: Object.keys(data.votes || {}),
                    mySelection: mySelection,
                    localActionDone: localActionDone
                })
                
                // Reset selection nur bei neuer Runde UND wenn noch nicht abgestimmt wurde
                // WICHTIG: Nur zurücksetzen wenn es wirklich eine neue Runde ist
                // WICHTIG: Prüfe auch lastRoundId, um sicherzustellen, dass es wirklich eine neue Runde ist
                const oldRoundId = globalData?.roundId ?? lastRoundId
                const isNewRound = globalData && data.roundId !== oldRoundId && oldRoundId !== null && oldRoundId !== undefined
                
                if (isNewRound) {
                    console.log('🎮 [GAME SCREEN] Neue Runde erkannt:', {
                        oldRoundId: oldRoundId,
                        newRoundId: data.roundId,
                        hasMyVote: !!data.votes?.[myName],
                        lastRoundId: lastRoundId,
                        currentMySelection: mySelection
                    })
                    setLastRoundId(data.roundId)
                    // WICHTIG: Bei neuer Runde IMMER mySelection zurücksetzen
                    // Die Auswahl der letzten Runde darf nicht in die neue Runde übernommen werden
                    // Auch wenn ein Vote existiert (was eigentlich nicht passieren sollte, da nextRound votes löscht),
                    // setzen wir mySelection erst auf null und dann wiederher, falls Vote existiert
                    console.log('🎮 [GAME SCREEN] Reset mySelection (neue Runde erkannt)')
                    setMySelection(null)
                    setLocalActionDone(false)
                    // WICHTIG: Reset alle Reward/Attack States bei neuer Runde, damit Spieler wieder auswählen kann
                    setShowRewardChoice(false)
                    setShowAttackSelection(false)
                    setShowJokerShop(false)
                    
                    // Wenn ein Vote existiert (Spieler hat bereits in der NEUEN Runde abgestimmt), restore aus Vote
                    if (data.votes?.[myName]) {
                        console.log('🎮 [GAME SCREEN] Restore Selection aus Vote (neue Runde, bereits abgestimmt):', data.votes[myName].choice)
                        setMySelection(data.votes[myName].choice)
                    }
                } else {
                    // WICHTIG: Wenn globalData noch nicht gesetzt ist, initialisiere lastRoundId
                    if (!globalData && data.roundId !== lastRoundId) {
                        console.log('🎮 [GAME SCREEN] Initialisiere lastRoundId:', data.roundId)
                        setLastRoundId(data.roundId)
                    }
                    // Bei gleicher Runde: Behalte Selection wenn bereits abgestimmt
                    // WICHTIG: NIE zurücksetzen, wenn andere Spieler abstimmen!
                    if (data.votes?.[myName]) {
                        // Spieler hat bereits abgestimmt - synchronisiere nur wenn Selection fehlt oder falsch ist
                        if (!mySelection) {
                            console.log('🎮 [GAME SCREEN] Restore Selection aus Vote (gleiche Runde):', data.votes[myName].choice)
                            setMySelection(data.votes[myName].choice)
                        } else if (mySelection !== data.votes[myName].choice) {
                            // Vote existiert, aber Selection stimmt nicht überein - synchronisiere
                            console.log('🎮 [GAME SCREEN] Synchronisiere Selection mit Vote (gleiche Runde):', {
                                mySelection: mySelection,
                                voteChoice: data.votes[myName].choice
                            })
                            setMySelection(data.votes[myName].choice)
                        } else {
                            // Selection stimmt bereits überein - keine Änderung
                            console.log('🎮 [GAME SCREEN] Selection bereits korrekt (gleiche Runde):', mySelection)
                        }
                    } else {
                        // Spieler hat noch nicht abgestimmt - BEHALTE Selection auf jeden Fall!
                        // WICHTIG: Setze Selection NIEMALS auf null, wenn andere Spieler abstimmen!
                        // WICHTIG: Prüfe ob mySelection bereits gesetzt ist - wenn ja, NIE zurücksetzen!
                        if (mySelection) {
                            console.log('🎮 [GAME SCREEN] Behalte Selection (noch nicht abgestimmt, gleiche Runde):', mySelection, '| Andere Votes:', Object.keys(data.votes || {}))
                            // WICHTIG: Stelle sicher, dass mySelection NICHT zurückgesetzt wird
                            // Die Selection bleibt bestehen, auch wenn andere Spieler abstimmen
                        } else {
                            console.log('🎮 [GAME SCREEN] Keine Selection (noch nicht abgestimmt, gleiche Runde)')
                        }
                        // WICHTIG: KEINE setMySelection(null) hier - das würde die Selection bei anderen Spielern löschen!
                    }
                }
                }
                
                // Hotseat-Popup immer beim Wechsel zu 'game' anzeigen (wenn hotseat gesetzt)
                // Prüfe ob es eine neue Runde ist (roundId hat sich geändert)
                const currentRoundId = data.roundId || 0
                // WICHTIG: Prüfe auch ob Modal bereits angezeigt wird, um mehrfache Anzeige zu verhindern
                if (data.hotseat && data.players && currentRoundId !== hotseatModalShownRef.current && !showHotseatModal) {
                    hotseatModalShownRef.current = currentRoundId
                    const isMeHotseat = myName === data.hotseat
                    console.log('🎯 [HOTSEAT MODAL] Neue Runde erkannt:', {
                        roundId: currentRoundId,
                        hotseat: data.hotseat,
                        isMeHotseat: isMeHotseat,
                        myName: myName,
                        players: Object.keys(data.players || {}),
                        showHotseatModal: showHotseatModal
                    })
                    // Warte kurz, damit der Screen gerendert ist
                    setTimeout(() => {
                        // Prüfe nochmal, ob Modal nicht bereits angezeigt wird
                        if (!showHotseatModal) {
                            triggerHotseatAlert(data.hotseat, data.players)
                        } else {
                            console.log('🎯 [HOTSEAT MODAL] Modal wird bereits angezeigt, überspringe triggerHotseatAlert')
                        }
                    }, 100)
                } else if (data.hotseat && currentRoundId === hotseatModalShownRef.current) {
                    console.log('🎯 [HOTSEAT MODAL] Bereits für diese Runde angezeigt, überspringe:', {
                        roundId: currentRoundId,
                        hotseatModalShownRef: hotseatModalShownRef.current,
                        showHotseatModal: showHotseatModal
                    })
                } else if (showHotseatModal && currentRoundId !== hotseatModalShownRef.current) {
                    // Modal wird angezeigt, aber es ist eine neue Runde - schließe Modal und setze Ref zurück
                    console.log('🎯 [HOTSEAT MODAL] Neue Runde erkannt während Modal offen, schließe Modal')
                    setShowHotseatModal(false)
                    hotseatModalShownRef.current = null
                }
            } else if (data.status === 'result') {
                if (currentScreen !== 'result') {
                    console.log('📊 [SCREEN] Wechsel zu Result | RoundId:', data.roundId)
                }
                setCurrentScreen('result')
                
                // Strategic Mode: Zeige Belohnungsauswahl wenn richtig geraten
                const gameMode = data.config?.gameMode || 'party'
                const isPartyMode = gameMode === 'party'
                const isHotseat = myName === data.hotseat
                const myVoteData = data.votes?.[myName]
                const hotseatVote = data.votes?.[data.hotseat]
                const truth = hotseatVote?.choice
                const hasTruth = truth !== undefined && truth !== null
                const guessedCorrectly = hasTruth && myVoteData && String(myVoteData.choice) === String(truth)
                const guessedWrong = hasTruth && myVoteData && String(myVoteData.choice) !== String(truth)
                const attackDecisions = data.attackDecisions || {}
                const roundRecapShown = data.roundRecapShown ?? false
                
                console.log('📊 [RESULT] Result-Screen Analyse:', {
                    roundId: data.roundId,
                    isHotseat: isHotseat,
                    isPartyMode: isPartyMode,
                    myVote: myVoteData?.choice,
                    hotseat: data.hotseat,
                    hotseatVote: hotseatVote,
                    truth: truth,
                    hasTruth: hasTruth,
                    guessedCorrectly: guessedCorrectly,
                    guessedWrong: guessedWrong,
                    attackDecisions: attackDecisions,
                    myAttackDecision: attackDecisions[myName],
                    roundRecapShown: roundRecapShown,
                    allVotes: Object.keys(data.votes || {})
                })
                
                // WICHTIG: Prüfe ob Hotseat überhaupt geantwortet hat
                if (!hasTruth && !isHotseat) {
                    console.warn('⚠️ [RESULT] Hotseat hat noch keine Antwort abgegeben, warte...', {
                        hotseat: data.hotseat,
                        hotseatVote: hotseatVote,
                        allVotes: Object.keys(data.votes || {}),
                        votes: data.votes
                    })
                    // Warte auf Hotseat-Antwort, keine Aktion
                    // KEINE Strafhitze anwenden, wenn truth undefined ist!
                } else if (isHotseat && !attackDecisions[myName] && db && roomId) {
                    // Hotseat: Automatisch als entschieden markieren
                    console.log('✅ [AUTO] Hotseat automatisch als entschieden markiert')
                    setLocalActionDone(true) // WICHTIG: Setze localActionDone für Hotseat, damit "Bereit"-Button angezeigt wird
                    updateDoc(doc(db, "lobbies", roomId), {
                        [`attackDecisions.${myName}`]: true
                    }).catch(console.error)
                } else if (!isHotseat && guessedWrong && !attackDecisions[myName] && !isPartyMode && db && roomId) {
                    // Falsch geraten (Strategic Mode): Automatisch als entschieden markieren
                    // Im Party Mode wird es bereits in handlePartyModeWrongAnswer gesetzt
                    console.log('❌ [AUTO] Falsch geraten (Strategic Mode) - automatisch als entschieden markiert')
                    updateDoc(doc(db, "lobbies", roomId), {
                        [`attackDecisions.${myName}`]: true
                    }).catch(console.error)
                }
                
                // WICHTIG: Prüfe ob es eine neue Runde ist, um sicherzustellen, dass attackDecisions zur aktuellen Runde gehört
                const isNewRoundForReward = lastRoundId !== data.roundId
                // WICHTIG: Reset States bei neuer Runde, damit Spieler wieder auswählen kann
                if (isNewRoundForReward) {
                    setShowRewardChoice(false)
                    setShowAttackSelection(false)
                    setShowJokerShop(false)
                }
                
                // Strategic Mode: Zeige Belohnungsauswahl wenn richtig geraten UND noch keine Entscheidung getroffen
                // WICHTIG: Prüfe auch ob es eine neue Runde ist, damit die Auswahl bei jeder Runde möglich ist
                if (!isHotseat && guessedCorrectly && !isPartyMode && !attackDecisions[myName] && !showRewardChoice && !showAttackSelection && !showJokerShop) {
                    // Strategic Mode: Zeige Belohnungsauswahl
                    console.log('🎁 [REWARD] Zeige Belohnungsauswahl (Strategic Mode)', {
                        roundId: data.roundId,
                        lastRoundId: lastRoundId,
                        isNewRound: isNewRoundForReward,
                        attackDecisions: attackDecisions[myName]
                    })
                    setShowRewardChoice(true)
                }
                
                // Prüfe ob Angriffe ausgeführt wurden und zeige Popup
                // WICHTIG: Prüfe auch ob Modal bereits für diese Runde angezeigt wurde
                // WICHTIG: Prüfe auch ob Popup bereits bestätigt wurde (popupConfirmed)
                // WICHTIG: Zeige Popup auch wenn totalDmg === 0 ("cool geblieben")
                const popupConfirmed = data.popupConfirmed?.[myName] === true
                
                if (data.attackResults && data.attackResults[myName] !== undefined && roundRecapShown && !popupConfirmed) {
                    const result = data.attackResults[myName]
                    const resultKey = `${data.roundId}-${result.totalDmg}-${JSON.stringify(result.attackDetails || [])}-${roundRecapShown}`
                    
                    console.log('💥 [ATTACK MODAL] Attack-Result gefunden:', {
                        roundId: data.roundId,
                        result: result,
                        resultKey: resultKey,
                        lastAttackResultKey: lastAttackResultKey,
                        attackModalShownRef: attackModalShownRef.current,
                        isOpeningAttackModal: isOpeningAttackModal,
                        showAttackModal: showAttackModal,
                        roundRecapShown: roundRecapShown,
                        popupConfirmed: popupConfirmed,
                        totalDmg: result.totalDmg,
                        attackDetails: result.attackDetails
                    })
                    
                    // WICHTIG: Prüfe mehrfach, um sicherzustellen, dass Modal nur einmal angezeigt wird
                    // Verwende Ref, um zu verhindern, dass Modal mehrmals angezeigt wird
                    // Prüfe auch ob Modal bereits angezeigt wird (showAttackModal)
                    // WICHTIG: Prüfe auch ob Popup bereits bestätigt wurde
                    const shouldShowModal = resultKey !== attackModalShownRef.current && 
                                           !isOpeningAttackModal && 
                                           !showAttackModal &&
                                           !popupConfirmed
                    
                    if (shouldShowModal) {
                        console.log('💥 [ATTACK MODAL] Modal wird angezeigt für Runde:', data.roundId, '| Schaden:', result.totalDmg, '°C')
                        // Setze Ref SOFORT, um mehrfache Anzeige zu verhindern
                        attackModalShownRef.current = resultKey
                        setLastAttackResultKey(resultKey)
                        setIsOpeningAttackModal(true)
                        setAttackResult(result)
                        // Warte kurz, damit der Screen gerendert ist
                        const timeoutId = setTimeout(() => {
                            // Prüfe nochmal, ob Modal nicht bereits angezeigt wird UND Ref noch stimmt UND Popup nicht bestätigt
                            if (!showAttackModal && attackModalShownRef.current === resultKey && !popupConfirmed) {
                                console.log('💥 [ATTACK MODAL] Modal wird jetzt sichtbar gemacht')
                                setShowAttackModal(true)
                                setIsOpeningAttackModal(false)
                            } else {
                                console.log('💥 [ATTACK MODAL] Modal wird bereits angezeigt, Ref geändert oder Popup bestätigt, überspringe setShowAttackModal:', {
                                    showAttackModal: showAttackModal,
                                    refMatches: attackModalShownRef.current === resultKey,
                                    popupConfirmed: popupConfirmed
                                })
                                setIsOpeningAttackModal(false)
                            }
                        }, 300)
                        timeoutIds.push(timeoutId)
                    } else {
                        console.log('💥 [ATTACK MODAL] Modal wird NICHT angezeigt:', {
                            resultKeyMatches: resultKey === attackModalShownRef.current,
                            isOpening: isOpeningAttackModal,
                            alreadyShown: showAttackModal,
                            popupConfirmed: popupConfirmed,
                            resultKey: resultKey,
                            attackModalShownRef: attackModalShownRef.current,
                            shouldShow: shouldShowModal
                        })
                    }
                } else {
                    // Kein Attack-Result oder roundRecapShown ist false oder Popup bereits bestätigt
                    console.log('💥 [ATTACK MODAL] Kein Modal:', {
                        hasAttackResults: !!data.attackResults,
                        hasMyResult: data.attackResults?.[myName] !== undefined,
                        roundRecapShown: roundRecapShown,
                        popupConfirmed: popupConfirmed,
                        roundId: data.roundId
                    })
                }
                
                // Prüfe ob alle Spieler ihre Entscheidung getroffen haben
                // WICHTIG: Nur Host führt executePendingAttacks aus
                const playerCount = Object.keys(data.players || {}).length
                const playersWithDecision = Object.keys(attackDecisions).filter(p => attackDecisions[p] === true)
                
                // WICHTIG: Zähle Hotseat als entschieden, wenn er automatisch markiert werden sollte
                // (auch wenn das Update noch nicht in Firebase angekommen ist)
                const hotseatShouldBeDecided = isHotseat && hasTruth
                const effectiveDecidedCount = playersWithDecision.length + (hotseatShouldBeDecided && !attackDecisions[data.hotseat] ? 1 : 0)
                const allDecided = effectiveDecidedCount >= playerCount
                const recapNotShown = !roundRecapShown
                
                // WICHTIG: Prüfe ob Hotseat überhaupt geantwortet hat, bevor executePendingAttacks ausgeführt wird
                if (!hasTruth && allDecided) {
                    console.warn('⚠️ [EXECUTE ATTACKS] Alle haben entschieden, aber Hotseat hat noch keine Antwort - warte...')
                }
                
                console.log('⚔️ [EXECUTE ATTACKS] Prüfung:', {
                    roundId: data.roundId,
                    playerCount: playerCount,
                    playersWithDecision: playersWithDecision.length,
                    effectiveDecidedCount: effectiveDecidedCount,
                    allDecided: allDecided,
                    recapNotShown: recapNotShown,
                    hasTruth: hasTruth,
                    hotseat: data.hotseat,
                    hotseatVote: hotseatVote,
                    isHost: isHost,
                    isMeHost: data.host === myName,
                    attackDecisions: attackDecisions,
                    hotseatShouldBeDecided: hotseatShouldBeDecided,
                    hotseatInDecisions: attackDecisions[data.hotseat]
                })
                
                // NUR HOST führt executePendingAttacks aus
                // WICHTIG: Nur ausführen wenn Hotseat geantwortet hat
                if (allDecided && recapNotShown && hasTruth && isHost && data.host === myName) {
                    // Verhindere mehrfache Ausführung
                    const timeoutKey = `executeAttacks_${data.roundId}`
                    if (!window[timeoutKey]) {
                        window[timeoutKey] = true
                        console.log('⚔️ [EXECUTE ATTACKS] Starte executePendingAttacks in 500ms (Hotseat hat geantwortet)')
                        const timeoutId = setTimeout(() => {
                            console.log('⚔️ [EXECUTE ATTACKS] Führe executePendingAttacks aus')
                            executePendingAttacks(data).catch(err => {
                                console.error('⚔️ [EXECUTE ATTACKS] Fehler:', err)
                            })
                            delete window[timeoutKey]
                        }, 500)
                        timeoutIds.push(timeoutId)
                    } else {
                        console.log('⚔️ [EXECUTE ATTACKS] Bereits geplant, überspringe')
                    }
                } else if (allDecided && recapNotShown && !hasTruth && isHost && data.host === myName) {
                    console.warn('⚠️ [EXECUTE ATTACKS] Alle haben entschieden, aber Hotseat hat noch keine Antwort - warte auf Hotseat')
                }
            } else if (data.status === 'winner') {
                setCurrentScreen('winner')
            }
            
            // Host Auto-Advance: Wenn alle Spieler geantwortet haben, automatisch zu Result
            // WICHTIG: Nur Host führt Auto-Advance aus
            // WICHTIG: Hotseat MUSS auch geantwortet haben!
            if (data.status === 'game' && isHost && data.host === myName && data.votes) {
                const playerCount = Object.keys(data.players || {}).length
                const voteCount = Object.keys(data.votes || {}).length
                const hotseat = data.hotseat
                const hotseatHasVoted = hotseat && data.votes?.[hotseat]?.choice !== undefined
                
                console.log('⏩ [AUTO-ADVANCE] Prüfung:', {
                    roundId: data.roundId,
                    status: data.status,
                    playerCount: playerCount,
                    voteCount: voteCount,
                    hotseat: hotseat,
                    hotseatHasVoted: hotseatHasVoted,
                    votes: Object.keys(data.votes || {}),
                    players: Object.keys(data.players || {}),
                    hotseatVote: data.votes?.[hotseat]
                })
                
                // WICHTIG: Alle Spieler (inklusive Hotseat) müssen geantwortet haben
                if (voteCount >= playerCount && playerCount > 0 && hotseatHasVoted) {
                    // Verhindere mehrfache Ausführung
                    const timeoutKey = `autoAdvance_${data.roundId}`
                    if (!window[timeoutKey]) {
                        window[timeoutKey] = true
                        console.log('⏩ [AUTO-ADVANCE] Alle haben geantwortet (inkl. Hotseat), wechsle zu Result in 1000ms')
                        const timeoutId = setTimeout(() => {
                            console.log('⏩ [AUTO-ADVANCE] Wechsle jetzt zu Result-Screen')
                            updateDoc(doc(db, "lobbies", roomId), { status: 'result' }).catch(err => {
                                console.error('⏩ [AUTO-ADVANCE] Fehler:', err)
                            })
                            delete window[timeoutKey]
                        }, 1000)
                        timeoutIds.push(timeoutId)
                    } else {
                        console.log('⏩ [AUTO-ADVANCE] Bereits geplant, überspringe')
                    }
                } else {
                    if (!hotseatHasVoted) {
                        console.log('⏩ [AUTO-ADVANCE] Hotseat hat noch nicht geantwortet:', hotseat, '| Warte...')
                    } else {
                        console.log('⏩ [AUTO-ADVANCE] Noch nicht alle geantwortet:', voteCount, '/', playerCount)
                    }
                }
            }
            
            // Host Auto-Next: Wenn alle Spieler bereit sind UND Popups bestätigt wurden, automatisch nächste Runde
            // WICHTIG: Nur Host führt Auto-Next aus
            const roundRecapShownForNext = data.roundRecapShown ?? false
            if (data.status === 'result' && isHost && data.host === myName && roundRecapShownForNext) {
                const playerCount = Object.keys(data.players || {}).length
                const readyCount = (data.ready || []).length
                const popupConfirmed = data.popupConfirmed || {}
                // WICHTIG: Prüfe ob alle Popups bestätigt wurden ODER ob keine Attack-Results existieren (keine Popups nötig)
                const hasAttackResults = data.attackResults && Object.keys(data.attackResults).length > 0
                const allPopupConfirmed = !hasAttackResults || Object.keys(data.players || {}).every(p => {
                    // Spieler ohne Attack-Result müssen kein Popup bestätigen
                    if (!data.attackResults?.[p]) return true
                    return popupConfirmed[p] === true
                })
                
                console.log('⏭️ [AUTO-NEXT] Prüfung:', {
                    roundId: data.roundId,
                    status: data.status,
                    roundRecapShown: data.roundRecapShown,
                    playerCount: playerCount,
                    readyCount: readyCount,
                    ready: data.ready || [],
                    hasAttackResults: hasAttackResults,
                    allPopupConfirmed: allPopupConfirmed,
                    popupConfirmed: popupConfirmed,
                    attackResults: Object.keys(data.attackResults || {})
                })
                
                // Alle müssen bereit sein UND alle Popups bestätigt haben (falls nötig)
                if (readyCount >= playerCount && playerCount > 0 && allPopupConfirmed) {
                    // Verhindere mehrfache Ausführung
                    const timeoutKey = `autoNext_${data.roundId}`
                    if (!window[timeoutKey]) {
                        window[timeoutKey] = true
                        console.log('⏭️ [AUTO-NEXT] Alle bereit und Popups bestätigt, starte nächste Runde in 1000ms')
                        const timeoutId = setTimeout(() => {
                            console.log('⏭️ [AUTO-NEXT] Starte nächste Runde')
                            nextRound().catch(err => {
                                console.error('⏭️ [AUTO-NEXT] Fehler:', err)
                            })
                            delete window[timeoutKey]
                        }, 1000)
                        timeoutIds.push(timeoutId)
                    } else {
                        console.log('⏭️ [AUTO-NEXT] Bereits geplant, überspringe')
                    }
                } else {
                    console.log('⏭️ [AUTO-NEXT] Bedingungen nicht erfüllt:', {
                        readyCheck: readyCount >= playerCount,
                        popupCheck: allPopupConfirmed,
                        readyCount: readyCount,
                        playerCount: playerCount,
                        hasAttackResults: hasAttackResults
                    })
                }
            }
        })
        
        // Cleanup-Funktion: Räume alle Timeouts auf und beende den Listener
        return () => {
            unsubscribe()
            // WICHTIG: Räume alle Timeouts auf, um Memory Leaks zu vermeiden
            timeoutIds.forEach(id => clearTimeout(id))
            // Räume auch window[timeoutKey] auf
            Object.keys(window).forEach(key => {
                if (key.startsWith('executeAttacks_') || key.startsWith('autoAdvance_') || key.startsWith('autoNext_')) {
                    delete window[key]
                }
            })
        }
    }, [db, roomId, myName])
    
    // Emoji auswählen - mit zentriertem Scrollen
    const emojiGalleryRef = useRef(null)
    const [emojiScrollIndex, setEmojiScrollIndex] = useState(Math.floor(availableEmojis.length / 2))
    
    // Initialisiere mit mittlerem Emoji - IMMER mittlerer Charakter als erstes
    useEffect(() => {
        const middleIndex = Math.floor(availableEmojis.length / 2)
        const middleEmoji = availableEmojis[middleIndex]
        // WICHTIG: Immer mittlerer Charakter als Standard, auch wenn bereits einer ausgewählt wurde
        if (!myEmoji || !availableEmojis.includes(myEmoji) || currentScreen === 'start') {
            setMyEmoji(middleEmoji)
            setEmojiScrollIndex(middleIndex)
            sessionStorage.setItem("hk_emoji", middleEmoji)
        } else {
            // Falls bereits ein Emoji gespeichert ist, verwende es, aber setze trotzdem auf Mitte beim ersten Laden
            const index = availableEmojis.indexOf(myEmoji)
            if (index >= 0) {
                setEmojiScrollIndex(index)
            } else {
                setEmojiScrollIndex(middleIndex)
                setMyEmoji(middleEmoji)
            }
        }
    }, [currentScreen])
    
    // Zentriere das ausgewählte Emoji
    useEffect(() => {
        if (emojiGalleryRef.current && emojiScrollIndex >= 0 && currentScreen === 'start') {
            const gallery = emojiGalleryRef.current
            const cards = gallery.querySelectorAll('.emoji-card')
            const selectedCard = cards[emojiScrollIndex]
            
            if (selectedCard) {
                // Warte auf Layout-Berechnung
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const galleryWidth = gallery.clientWidth
                            const cardWidth = selectedCard.offsetWidth
                            const cardLeft = selectedCard.offsetLeft
                            const scrollPosition = cardLeft - (galleryWidth / 2) + (cardWidth / 2)
                            gallery.scrollTo({
                                left: Math.max(0, scrollPosition),
                                behavior: 'smooth'
                            })
                        })
                    })
                }, 100)
            }
        }
    }, [emojiScrollIndex, currentScreen])
    
    const selectEmoji = (emoji) => {
        const index = availableEmojis.indexOf(emoji)
        if (index >= 0) {
            setMyEmoji(emoji)
            setEmojiScrollIndex(index)
            sessionStorage.setItem("hk_emoji", emoji)
        }
    }
    
    // Scroll-Funktionen für Emoji-Galerie
    const scrollEmojiLeft = () => {
        if (emojiScrollIndex > 0) {
            const newIndex = emojiScrollIndex - 1
            setEmojiScrollIndex(newIndex)
            setMyEmoji(availableEmojis[newIndex])
            sessionStorage.setItem("hk_emoji", availableEmojis[newIndex])
        }
    }
    
    const scrollEmojiRight = () => {
        if (emojiScrollIndex < availableEmojis.length - 1) {
            const newIndex = emojiScrollIndex + 1
            setEmojiScrollIndex(newIndex)
            setMyEmoji(availableEmojis[newIndex])
            sessionStorage.setItem("hk_emoji", availableEmojis[newIndex])
        }
    }
    
    // Name speichern
    const handleNameChange = (e) => {
        const name = e.target.value.trim().substring(0, 20)
        setMyName(name)
        sessionStorage.setItem("hk_name", name)
    }
    
    // Kategorie umschalten
    const toggleCategory = (catKey) => {
        if (catKey === 'all') {
            if (selectedCategories.length === Object.keys(questionCategories).length) {
                setSelectedCategories([])
            } else {
                setSelectedCategories(Object.keys(questionCategories))
            }
        } else {
            if (selectedCategories.includes(catKey)) {
                setSelectedCategories(selectedCategories.filter(c => c !== catKey))
            } else {
                setSelectedCategories([...selectedCategories, catKey])
            }
        }
    }
    
    // Spiel erstellen
    const createGame = async () => {
        if (!myName.trim()) {
            alert("Bitte gib deinen Namen ein!")
            return
        }
        if (selectedCategories.length === 0) {
            alert("Bitte wähle mindestens eine Kategorie aus!")
            return
        }
        
        const dmg = gameMode === 'strategisch' ? 10 : 20
        const speed = gameMode === 'strategisch' ? 1.0 : 1.5
        const maxTemp = gameMode === 'strategisch' ? 120 : 100
        
        const code = Math.random().toString(36).substring(2, 6).toUpperCase()
        setRoomId(code)
        sessionStorage.setItem("hk_room", code)
        setIsHost(true)
        
        const allQuestions = getAllQuestions(selectedCategories)
        const firstQuestion = allQuestions[0] || { q: "Willkommen zu Hitzkopf!", a: "A", b: "B" }
        const firstCategory = firstQuestion.category || null
        
        await setDoc(doc(db, "lobbies", code), {
            host: myName,
            hostName: myName,
            status: "lobby",
            createdAt: serverTimestamp(),
            players: { [myName]: { temp: 0, inventory: [], emoji: myEmoji } },
            config: { dmg, speed, startTemp: 0, maxTemp, gameMode, categories: selectedCategories },
            votes: {},
            ready: [],
            log: [],
            hotseat: "",
            currentQ: firstQuestion,
            roundId: 0,
            lobbyReady: {},
            password: roomPassword || "",
            lastQuestionCategory: firstCategory,
        })
        
        setCurrentScreen('lobby')
    }
    
    // Spiel beitreten (mit Raum-ID)
    const joinGame = async (targetRoomId = null) => {
        if (!myName.trim()) {
            alert("Bitte gib deinen Namen ein!")
            return
        }
        
        const code = (targetRoomId || roomCode).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6)
        if (!code || code.length < 4) {
            alert("Bitte wähle einen Raum aus der Liste!")
            return
        }
        
        const ref = doc(db, "lobbies", code)
        const snap = await getDoc(ref)
        
        if (!snap.exists()) {
            alert("Lobby nicht gefunden!")
            return
        }
        
        const roomData = snap.data()
        if (roomData.password && roomData.password !== joinPassword) {
            alert("Falsches Passwort!")
            return
        }
        
        // Prüfe ob Spieler bereits existiert
        if (roomData.players && roomData.players[myName]) {
            alert("Du bist bereits in diesem Raum!")
        }
        
        setRoomId(code)
        sessionStorage.setItem("hk_room", code)
        setIsHost(false)
        
        await updateDoc(ref, {
            [`players.${myName}`]: { temp: 0, inventory: [], emoji: myEmoji }
        })
        
        // Screen wird durch Listener automatisch auf 'lobby' gesetzt
    }
    
    // Raumliste laden
    const loadRoomList = async () => {
        if (!db) return
        const roomsRef = collection(db, "lobbies")
        const q = query(roomsRef, where("status", "==", "lobby"))
        const querySnapshot = await getDocs(q)
        
        const rooms = []
        querySnapshot.forEach((doc) => {
            const data = doc.data()
            if (data.hostName && data.status === 'lobby') {
                rooms.push({
                    id: doc.id,
                    hostName: data.hostName,
                    playerCount: Object.keys(data.players || {}).length,
                    hasPassword: !!(data.password && data.password.trim().length > 0)
                })
            }
        })
        setRoomList(rooms)
    }
    
    // Raum auswählen
    const selectRoom = async (targetRoomId, hasPassword) => {
        setRoomCode(targetRoomId)
        if (!hasPassword) {
            // Kein Passwort, direkt beitreten
            await joinGame(targetRoomId)
        } else {
            // Passwort erforderlich - warte auf Eingabe
            // Der User kann dann den "Beitreten"-Button klicken
        }
    }
    
    // Lobby Ready umschalten
    const toggleLobbyReady = async () => {
        if (!db || !roomId) return
        const current = !!(globalData?.lobbyReady?.[myName])
        await updateDoc(doc(db, "lobbies", roomId), {
            [`lobbyReady.${myName}`]: !current
        })
    }
    
    // Spiel starten (nur Host)
    const startCountdown = async () => {
        console.log('🎮 [START COUNTDOWN] Starte Spiel:', {
            isHost: isHost,
            hasDb: !!db,
            roomId: roomId
        })
        
        if (!db || !roomId || !isHost) {
            console.warn('🎮 [START COUNTDOWN] Nicht der Host oder fehlende Parameter')
            return
        }
        
        const players = Object.keys(globalData?.players || {})
        const lobbyReady = globalData?.lobbyReady || {}
        const readyCount = players.filter(p => lobbyReady[p]).length
        
        console.log('🎮 [START COUNTDOWN] Prüfung:', {
            players: players,
            readyCount: readyCount,
            totalPlayers: players.length,
            lobbyReady: lobbyReady
        })
        
        if (readyCount < players.length || players.length < 2) {
            console.warn('🎮 [START COUNTDOWN] Nicht alle bereit:', readyCount, '/', players.length)
            alert(`Alle Spieler müssen bereit sein! (${readyCount}/${players.length})`)
            return
        }
        
        // WICHTIG: Eiswürfel-Automatik vor dem Start
        await applyIceCooling(globalData.players)
        
        // WICHTIG: Hotseat und erste Frage setzen
        const usedQuestions = globalData?.usedQuestions || []
        const activeCategories = globalData?.config?.categories || Object.keys(questionCategories)
        const allQuestions = getAllQuestions(activeCategories)
        const unusedQuestions = allQuestions.filter((q, idx) => !usedQuestions.includes(idx))
        const randomQ = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)] || allQuestions[0]
        const qIndex = allQuestions.findIndex(q => q.q === randomQ.q)
        const nextRoundId = (globalData?.roundId ?? 0) + 1
        const countdownEnds = Date.now() + 3000
        
        console.log('🎮 [START COUNTDOWN] Starte erste Runde:', {
            hotseat: players[0],
            question: randomQ.q,
            roundId: nextRoundId,
            qIndex: qIndex
        })
        
        await updateDoc(doc(db, "lobbies", roomId), {
            status: 'countdown',
            hotseat: players[0],
            currentQ: randomQ,
            votes: {},
            ready: [],
            roundId: nextRoundId,
            countdownEnds: countdownEnds,
            lobbyReady: {},
            usedQuestions: qIndex !== -1 ? [...usedQuestions, qIndex] : usedQuestions,
            lastQuestionCategory: randomQ.category,
            pendingAttacks: {},
            attackDecisions: {},
            attackResults: {},
            roundRecapShown: false,
            popupConfirmed: {}
        })
        
        console.log('🎮 [START COUNTDOWN] Countdown gestartet, wechsle zu Game in 3300ms')
        
        setTimeout(() => {
            console.log('🎮 [START COUNTDOWN] Wechsle zu Game-Status')
            updateDoc(doc(db, "lobbies", roomId), { 
                status: 'game', 
                countdownEnds: deleteField() 
            }).catch(err => {
                console.error('🎮 [START COUNTDOWN] Fehler beim Wechsel zu Game:', err)
            })
        }, 3300)
    }
    
    // Antwort wählen
    const vote = (choice) => {
        setMySelection(choice)
    }
    
    // Antwort absenden - ATOMARES UPDATE (nur spezifischer Pfad)
    const submitVote = async () => {
        console.log('📝 [SUBMIT VOTE] Starte submitVote:', {
            mySelection: mySelection,
            myName: myName,
            roomId: roomId,
            hasDb: !!db
        })
        
        if (!db || !roomId) {
            console.warn('📝 [SUBMIT VOTE] Fehlende Parameter (db oder roomId)')
            alert("Fehler: Datenbank-Verbindung fehlt!")
            return
        }
        
        // Prüfe ob bereits abgestimmt wurde (lokal UND in Firebase)
        const currentDoc = await getDoc(doc(db, "lobbies", roomId))
        if (!currentDoc.exists()) {
            console.error('📝 [SUBMIT VOTE] Lobby existiert nicht mehr')
            alert("Lobby existiert nicht mehr!")
            return
        }
        
        const currentData = currentDoc.data()
        const existingVote = currentData?.votes?.[myName]
        const currentRoundId = currentData?.roundId || 0
        
        console.log('📝 [SUBMIT VOTE] Prüfe bestehende Votes:', {
            existingVote: existingVote,
            allVotes: Object.keys(currentData?.votes || {}),
            roundId: currentRoundId,
            myName: myName,
            mySelection: mySelection
        })
        
        // WICHTIG: Prüfe ob bereits in dieser Runde abgestimmt wurde
        if (existingVote && currentRoundId === (globalData?.roundId || 0)) {
            console.warn('📝 [SUBMIT VOTE] Bereits in dieser Runde abgestimmt:', existingVote)
            alert("Du hast bereits abgestimmt!")
            return
        }
        
        // WICHTIG: Prüfe ob mySelection noch gesetzt ist (könnte durch Re-Render zurückgesetzt worden sein)
        // RACE-CONDITION-FIX: Verhindere rekursive setTimeout-Loops
        if (!mySelection) {
            console.warn('📝 [SUBMIT VOTE] mySelection ist null - versuche aus existingVote zu restaurieren')
            if (existingVote?.choice) {
                console.log('📝 [SUBMIT VOTE] Restore mySelection aus existingVote:', existingVote.choice)
                setMySelection(existingVote.choice)
                // WICHTIG: Verwende existingVote.choice direkt statt rekursivem setTimeout
                // Das verhindert unendliche Loops und Race Conditions
                const restoredChoice = existingVote.choice
                // Fahre mit dem Vote fort, anstatt rekursiv submitVote aufzurufen
                // (Der Code wird nach setMySelection fortgesetzt)
            } else {
                console.error('📝 [SUBMIT VOTE] mySelection ist null und keine existingVote vorhanden')
                alert("Bitte wähle zuerst eine Antwort!")
                return
            }
        }
        
        // WICHTIG: Verwende restoredChoice falls vorhanden, sonst mySelection
        const voteChoice = mySelection || existingVote?.choice
        if (!voteChoice) {
            console.error('📝 [SUBMIT VOTE] Keine Wahl verfügbar')
            alert("Bitte wähle zuerst eine Antwort!")
            return
        }
        
        console.log('📝 [SUBMIT VOTE] Sende Vote an Firebase:', {
            choice: String(voteChoice),
            strategy: myStrategy || 'none',
            roundId: currentRoundId
        })
        
        // ATOMARES UPDATE: Nur den spezifischen Vote-Pfad aktualisieren
        // WICHTIG: Verwende updateDoc, nicht setDoc, um andere Votes nicht zu überschreiben
        await updateDoc(doc(db, "lobbies", roomId), {
            [`votes.${myName}`]: { choice: String(mySelection), strategy: myStrategy || 'none' }
        }).then(() => {
            console.log('📝 [SUBMIT VOTE] Vote erfolgreich gesendet')
            // Prüfe nach dem Update, ob alle Votes noch vorhanden sind
            getDoc(doc(db, "lobbies", roomId)).then(doc => {
                const updatedData = doc.data()
                console.log('📝 [SUBMIT VOTE] Nach Update - Alle Votes:', {
                    allVotes: Object.keys(updatedData?.votes || {}),
                    votes: updatedData?.votes,
                    roundId: updatedData?.roundId
                })
            })
        }).catch(err => {
            console.error("📝 [SUBMIT VOTE] Fehler beim Absenden der Antwort:", err)
            alert("Fehler beim Absenden der Antwort!")
        })
    }
    
    // Bereit setzen (für Result-Screen)
    const setReady = async () => {
        console.log('👍 [SET READY] setReady aufgerufen für', myName)
        
        if (!db || !roomId) {
            console.warn('👍 [SET READY] Fehlende Parameter')
            return
        }
        
        // WICHTIG: Lese aktuelle ready-Liste direkt aus Firebase, nicht aus globalData
        // Das verhindert Race-Conditions und unnötige Re-Renders
        const ref = doc(db, "lobbies", roomId)
        const currentDoc = await getDoc(ref)
        
        if (!currentDoc.exists()) {
            console.error('👍 [SET READY] Lobby existiert nicht mehr')
            return
        }
        
        const currentData = currentDoc.data()
        const currentReady = currentData?.ready || []
        const isReady = currentReady.includes(myName)
        
        console.log('👍 [SET READY] Aktueller Status:', {
            isReady: isReady,
            currentReady: currentReady,
            willToggle: !isReady
        })
        
        // WICHTIG: Prüfe ob bereits in der Liste (verhindert doppelte Einträge)
        if (isReady) {
            // Entferne aus ready-Liste
            const updatedReady = currentReady.filter(n => n !== myName)
            await updateDoc(ref, {
                ready: updatedReady
            }).then(() => {
                console.log('👍 [SET READY] Nicht mehr bereit gesetzt')
            }).catch(err => {
                console.error('👍 [SET READY] Fehler:', err)
            })
        } else {
            // Füge zu ready-Liste hinzu
            const updatedReady = [...currentReady, myName]
            await updateDoc(ref, {
                ready: updatedReady
            }).then(() => {
                console.log('👍 [SET READY] Bereit gesetzt')
            }).catch(err => {
                console.error('👍 [SET READY] Fehler:', err)
            })
        }
    }
    
    // Lobby verlassen
    const leaveLobby = () => {
        setRoomId("")
        setGlobalData(null)
        setCurrentScreen('start')
        sessionStorage.removeItem("hk_room")
    }
    
    // Spieler-Liste rendern
    // PERFORMANCE-FIX: useMemo verhindert unnötige Neuberechnungen bei jedem Render
    const players = useMemo(() => {
        if (!globalData?.players) return []
        return Object.entries(globalData.players).map(([name, data]) => ({
            name,
            temp: data.temp || 0,
            emoji: data.emoji || '😊'
        }))
    }, [globalData?.players])
    
    // Alias für Rückwärtskompatibilität
    const renderPlayers = useCallback(() => players, [players])
    
    // Ref für Hotseat-Modal, um zu verhindern, dass es mehrfach angezeigt wird
    const hotseatModalShownRef = useRef(null)
    // Ref für Attack-Modal, um zu verhindern, dass es mehrfach angezeigt wird
    const attackModalShownRef = useRef(null)
    
    // Hotseat-Popup anzeigen
    const triggerHotseatAlert = (hotseatName, players) => {
        if (hotseatName && players) {
            // WICHTIG: Prüfe ob Modal bereits angezeigt wird, um mehrfache Anzeige zu verhindern
            if (showHotseatModal) {
                console.log('🎯 [HOTSEAT MODAL] triggerHotseatAlert übersprungen - Modal wird bereits angezeigt')
                return
            }
            const isMeHotseat = myName === hotseatName
            console.log('🎯 [HOTSEAT MODAL] triggerHotseatAlert aufgerufen:', {
                hotseatName: hotseatName,
                isMeHotseat: isMeHotseat,
                myName: myName,
                players: Object.keys(players || {}),
                showHotseatModal: showHotseatModal
            })
            setShowHotseatModal(true)
            console.log('🎯 [HOTSEAT MODAL] showHotseatModal auf true gesetzt')
        } else {
            console.warn('🎯 [HOTSEAT MODAL] triggerHotseatAlert fehlgeschlagen - fehlende Parameter:', { hotseatName, players })
        }
    }
    
    // Hotseat-Modal schließen
    const closeHotseatModal = () => {
        console.log('🎯 [HOTSEAT MODAL] Modal wird geschlossen')
        setShowHotseatModal(false)
    }
    
    // Attack-Modal schließen
    const closeAttackModal = async () => {
        console.log('💥 [ATTACK MODAL] Modal wird geschlossen')
        setShowAttackModal(false)
        setIsOpeningAttackModal(false)
        setAttackResult(null)
        
        // WICHTIG: Markiere Popup als bestätigt, damit es nicht erneut angezeigt wird
        if (roomId && myName && db) {
            try {
                const ref = doc(db, "lobbies", roomId)
                const currentData = await getDoc(ref)
                const currentPopupConfirmed = currentData.data()?.popupConfirmed || {}
                
                if (!currentPopupConfirmed[myName]) {
                    console.log('💥 [ATTACK MODAL] Markiere Popup als bestätigt für', myName)
                    await updateDoc(ref, {
                        [`popupConfirmed.${myName}`]: true
                    })
                    console.log('💥 [ATTACK MODAL] Popup erfolgreich als bestätigt markiert')
                } else {
                    console.log('💥 [ATTACK MODAL] Popup bereits als bestätigt markiert')
                }
            } catch (err) {
                console.error('💥 [ATTACK MODAL] Fehler beim Markieren als bestätigt:', err)
            }
        }
        
        // WICHTIG: Setze Ref NICHT zurück, damit Modal nicht erneut angezeigt wird
        
        // Markiere Popup als bestätigt
        if (roomId && myName && db) {
            try {
                const ref = doc(db, "lobbies", roomId)
                const currentData = await getDoc(ref)
                const currentPopupConfirmed = currentData.data()?.popupConfirmed || {}
                
                if (!currentPopupConfirmed[myName]) {
                    console.log('💥 [ATTACK MODAL] Markiere Popup als bestätigt für', myName)
                    await updateDoc(ref, {
                        [`popupConfirmed.${myName}`]: true
                    })
                    console.log('💥 [ATTACK MODAL] Popup erfolgreich als bestätigt markiert')
                } else {
                    console.log('💥 [ATTACK MODAL] Popup bereits als bestätigt markiert')
                }
            } catch (error) {
                console.error('💥 [ATTACK MODAL] Fehler beim Markieren des Popups als bestätigt:', error)
            }
        }
    }
    
    // Party Mode: Falsche Antwort (10° Strafhitze)
    const handlePartyModeWrongAnswer = async () => {
        console.log('❌ [PARTY MODE] handlePartyModeWrongAnswer aufgerufen für', myName)
        
        if (!db || !roomId) {
            console.warn('❌ [PARTY MODE] Fehlende Parameter')
            return
        }
        
        const dmg = 10
        const ref = doc(db, "lobbies", roomId)
        const currentData = await getDoc(ref)
        const currentAttackDecisions = currentData.data()?.attackDecisions || {}
        const updatedAttackDecisions = {
            ...currentAttackDecisions,
            [myName]: true
        }
        
        console.log('❌ [PARTY MODE] Wende Strafhitze an:', {
            dmg: dmg,
            myName: myName,
            attackDecisions: updatedAttackDecisions
        })
        
        await updateDoc(ref, {
            [`players.${myName}.temp`]: increment(dmg),
            log: arrayUnion(`❌ ${myName} hat falsch geraten und sich selbst aufgeheizt (+${dmg}°C)`),
            attackDecisions: updatedAttackDecisions
        }).then(() => {
            console.log('❌ [PARTY MODE] Strafhitze erfolgreich angewendet')
        }).catch(err => {
            console.error('❌ [PARTY MODE] Fehler:', err)
        })
    }
    
    // Angriff ausführen
    const doAttack = async (target) => {
        console.log('🔥 [ATTACK] doAttack aufgerufen:', {
            attacker: myName,
            target: target,
            roomId: roomId
        })
        
        if (!db || !roomId) {
            console.warn('🔥 [ATTACK] Fehlende Parameter')
            return
        }
        
        setLocalActionDone(true)
        console.log('🔥 [ATTACK] localActionDone auf true gesetzt')
        
        const gameMode = globalData?.config?.gameMode || 'party'
        const isPartyMode = gameMode === 'party'
        const baseDmg = isPartyMode ? 20 : (globalData?.config?.dmg || 10)
        const attackerState = globalData?.players?.[myName] || {}
        const hasOil = attackerState.inventory?.includes('card_oil')
        const dmg = baseDmg * (hasOil ? 2 : 1)
        
        console.log('🔥 [ATTACK] Angriffsdetails:', {
            gameMode: gameMode,
            isPartyMode: isPartyMode,
            baseDmg: baseDmg,
            hasOil: hasOil,
            finalDmg: dmg
        })
        
        const ref = doc(db, "lobbies", roomId)
        const currentData = await getDoc(ref)
        const currentPendingAttacks = currentData.data()?.pendingAttacks || {}
        const targetAttacks = currentPendingAttacks[target] || []
        
        targetAttacks.push({
            attacker: myName,
            dmg: dmg,
            hasOil: hasOil
        })
        
        const updatedPendingAttacks = {
            ...currentPendingAttacks,
            [target]: targetAttacks
        }
        
        const currentAttackDecisions = currentData.data()?.attackDecisions || {}
        const updatedAttackDecisions = {
            ...currentAttackDecisions,
            [myName]: true
        }
        
        const updateData = {
            pendingAttacks: updatedPendingAttacks,
            attackDecisions: updatedAttackDecisions
        }
        
        if (hasOil) {
            updateData[`players.${myName}.inventory`] = arrayRemove('card_oil')
            console.log('🔥 [ATTACK] Ölfass wird verbraucht')
        }
        
        console.log('🔥 [ATTACK] Update Firebase mit:', {
            pendingAttacks: updatedPendingAttacks,
            attackDecisions: updatedAttackDecisions
        })
        
        await updateDoc(ref, updateData).then(() => {
            console.log('🔥 [ATTACK] Angriff erfolgreich gesendet')
        }).catch(err => {
            console.error('🔥 [ATTACK] Fehler:', err)
        })
    }
    
    // Nächste Runde starten - NUR VOM HOST
    const nextRound = async () => {
        console.log('🔄 [NEXT ROUND] Starte nextRound:', {
            isHost: isHost,
            hasDb: !!db,
            roomId: roomId,
            myName: myName
        })
        
        if (!db || !roomId || !isHost) {
            console.warn('🔄 [NEXT ROUND] Nicht der Host oder fehlende Parameter')
            return
        }
        
        // Prüfe nochmal explizit ob Host
        const currentDoc = await getDoc(doc(db, "lobbies", roomId))
        if (!currentDoc.exists() || currentDoc.data().host !== myName) {
            console.warn('🔄 [NEXT ROUND] Host-Check fehlgeschlagen:', {
                exists: currentDoc.exists(),
                host: currentDoc.data()?.host,
                myName: myName
            })
            return
        }
        
        const currentData = currentDoc.data()
        console.log('🔄 [NEXT ROUND] Aktuelle Daten:', {
            roundId: currentData.roundId,
            status: currentData.status,
            players: Object.keys(currentData.players || {})
        })
        const players = Object.keys(currentData?.players || {})
        const maxTemp = currentData?.config?.maxTemp || 100
        const activePlayers = players.filter(p => (currentData?.players[p]?.temp || 0) < maxTemp)
        
        console.log('🔄 [NEXT ROUND] Aktive Spieler:', {
            allPlayers: players,
            activePlayers: activePlayers,
            maxTemp: maxTemp,
            playerTemps: players.map(p => ({ name: p, temp: currentData?.players[p]?.temp || 0 }))
        })
        
        if (activePlayers.length === 0) {
            // Alle sind raus, nimm alle Spieler
            console.log('🔄 [NEXT ROUND] Alle Spieler sind raus, nehme alle Spieler')
            activePlayers.push(...players)
        }
        
        // WICHTIG: Rotiere Hotseat - finde nächsten Spieler
        const currentHotseat = currentData?.hotseat || ''
        let nextHotseatIndex = activePlayers.indexOf(currentHotseat)
        if (nextHotseatIndex === -1) nextHotseatIndex = 0
        nextHotseatIndex = (nextHotseatIndex + 1) % activePlayers.length
        const nextHotseat = activePlayers[nextHotseatIndex]
        
        const usedQuestions = currentData?.usedQuestions || []
        const activeCategories = currentData?.config?.categories || Object.keys(questionCategories)
        
        // Zufällige Frage auswählen
        const allQuestions = getAllQuestions(activeCategories)
        const unusedQuestions = allQuestions.filter((q, idx) => !usedQuestions.includes(idx))
        const randomQ = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)] || allQuestions[0]
        const qIndex = allQuestions.findIndex(q => q.q === randomQ.q)
        
        const nextRoundId = (currentData?.roundId ?? 0) + 1
        // WICHTIG: Countdown nur beim ersten Start, nicht bei jeder Runde
        // Bei nextRound direkt zu 'game' wechseln, ohne Countdown
        
        console.log('🔄 [NEXT ROUND] Runden-Details:', {
            currentHotseat: currentHotseat,
            nextHotseat: nextHotseat,
            nextHotseatIndex: nextHotseatIndex,
            question: randomQ.q,
            nextRoundId: nextRoundId
        })
        
        // WICHTIG: Eiswürfel-Automatik vor dem Rundenwechsel
        console.log('🧊 [NEXT ROUND] Wende Eiswürfel-Automatik an')
        await applyIceCooling(currentData.players)
        
        console.log('🔄 [NEXT ROUND] Bereite nächste Runde vor:', {
            nextRoundId: nextRoundId,
            hotseat: nextHotseat,
            question: randomQ.q,
            activePlayers: activePlayers
        })
        
        // ATOMARES UPDATE: Nur spezifische Felder setzen, nicht ganze Objekte überschreiben
        // Verwende deleteField für Felder, die zurückgesetzt werden sollen
        const updateData = {
            status: 'game', // WICHTIG: Direkt zu 'game', kein 'countdown' bei nextRound
            hotseat: nextHotseat,
            currentQ: randomQ,
            roundId: nextRoundId,
            // WICHTIG: countdownEnds NICHT setzen - Countdown nur beim ersten Start
            lastQuestionCategory: randomQ.category,
            roundRecapShown: false
        }
        
        // Lösche alte Felder atomar
        updateData.votes = deleteField()
        updateData.ready = []
        updateData.lobbyReady = {}
        updateData.pendingAttacks = {}
        updateData.attackDecisions = {}
        updateData.attackResults = {}
        updateData.popupConfirmed = {}
        // WICHTIG: Lösche countdownEnds, falls es noch existiert
        updateData.countdownEnds = deleteField()
        
        // Füge neue usedQuestion hinzu
        if (qIndex !== -1) {
            updateData.usedQuestions = [...usedQuestions, qIndex]
        }
        
        console.log('🔄 [NEXT ROUND] Update Firebase mit:', {
            ...updateData,
            votes: '[deleteField]',
            countdownEnds: '[deleteField]',
            usedQuestions: updateData.usedQuestions?.length || 0
        })
        
        await updateDoc(doc(db, "lobbies", roomId), updateData)
        console.log('🔄 [NEXT ROUND] Firebase aktualisiert, direkt zu Game-Status (kein Countdown)')
    }
    
    // executePendingAttacks - Hitze verteilen - NUR VOM HOST
    const executePendingAttacks = async (data) => {
        console.log('⚔️ [EXECUTE ATTACKS] Starte executePendingAttacks:', {
            roundId: data?.roundId,
            isHost: isHost,
            hasDb: !!db,
            roomId: roomId
        })
        
        if (!db || !roomId || !isHost) {
            console.warn('⚔️ [EXECUTE ATTACKS] Nicht der Host oder fehlende Parameter')
            return
        }
        
        // Prüfe nochmal explizit ob Host
        const currentDoc = await getDoc(doc(db, "lobbies", roomId))
        if (!currentDoc.exists() || currentDoc.data().host !== myName) {
            console.warn('⚔️ [EXECUTE ATTACKS] Host-Check fehlgeschlagen')
            return
        }
        
        // Verwende aktuelle Daten aus Firebase, nicht übergebene Daten
        const currentData = currentDoc.data()
        const pendingAttacks = currentData.pendingAttacks || {}
        const players = currentData.players || {}
        
        console.log('⚔️ [EXECUTE ATTACKS] Verarbeite Angriffe:', {
            roundId: currentData.roundId,
            pendingAttacks: pendingAttacks,
            players: Object.keys(players)
        })
        
        const tempUpdates = {}
        const attackResults = {}
        const logEntries = []
        
        // Verarbeite alle Angriffe
        for (const [target, attacks] of Object.entries(pendingAttacks)) {
            if (!players[target] || !Array.isArray(attacks) || attacks.length === 0) continue
            
            const targetState = players[target]
            const targetHasMirror = targetState.inventory?.includes('card_mirror')
            let totalDmg = 0
            const attackerNames = []
            
            attacks.forEach(attack => {
                totalDmg += attack.dmg || 0
                attackerNames.push(attack.attacker)
                if (attack.hasOil) {
                    logEntries.push(`🔥 ${attack.attacker} greift ${target} mit dem Ölfass an (+${attack.dmg}°C)`)
                } else {
                    logEntries.push(`🔥 ${attack.attacker} greift ${target} an (+${attack.dmg}°C)`)
                }
            })
            
            if (targetHasMirror) {
                // Spiegele Angriffe zurück - ATOMARES UPDATE
                await updateDoc(doc(db, "lobbies", roomId), {
                    [`players.${target}.inventory`]: arrayRemove('card_mirror')
                })
                
                attacks.forEach(attack => {
                    if (!tempUpdates[`players.${attack.attacker}.temp`]) {
                        tempUpdates[`players.${attack.attacker}.temp`] = 0
                    }
                    tempUpdates[`players.${attack.attacker}.temp`] += attack.dmg || 0
                })
                
                const attackerList = attackerNames.join(' und ')
                logEntries.push(`🪞 ${target} spiegelt die Angriffe von ${attackerList} zurück! (+${totalDmg}°C)`)
                
                attackResults[target] = {
                    attackers: attackerNames,
                    totalDmg: 0,
                    attackDetails: attacks.map(a => ({ attacker: a.attacker, dmg: a.dmg || 0, mirrored: true }))
                }
            } else {
                // Normaler Angriff
                if (!tempUpdates[`players.${target}.temp`]) {
                    tempUpdates[`players.${target}.temp`] = 0
                }
                tempUpdates[`players.${target}.temp`] += totalDmg
                
                attackResults[target] = {
                    attackers: [...attackerNames],
                    totalDmg: totalDmg,
                    attackDetails: attacks.map(a => ({ attacker: a.attacker, dmg: a.dmg || 0 }))
                }
            }
        }
        
        // Füge Strafhitze für falsche Antworten hinzu
        const votes = currentData.votes || {}
        const hotseat = currentData.hotseat
        const truth = votes?.[hotseat]?.choice
        const gameMode = currentData.config?.gameMode || 'party'
        const isPartyMode = gameMode === 'party'
        const allPlayers = Object.keys(players)
        
        // WICHTIG: Vergleiche Strings mit Strings (Firebase speichert als String)
        allPlayers.forEach(playerName => {
            if (playerName === hotseat) return
            
            const playerVote = votes[playerName]
            // Konvertiere beide zu String für Vergleich
            const playerChoice = String(playerVote?.choice || '')
            const truthChoice = String(truth || '')
            
            if (playerVote && playerChoice !== truthChoice) {
                // Falsch geraten - Strafhitze
                let penaltyDmg = 10
                if (isPartyMode) {
                    // Im Party Mode wurde bereits 10° in handlePartyModeWrongAnswer angewendet
                    penaltyDmg = 0
                }
                
                if (penaltyDmg > 0) {
                    if (!tempUpdates[`players.${playerName}.temp`]) {
                        tempUpdates[`players.${playerName}.temp`] = 0
                    }
                    tempUpdates[`players.${playerName}.temp`] += penaltyDmg
                }
                
                if (!attackResults[playerName]) {
                    attackResults[playerName] = {
                        attackers: [],
                        totalDmg: 0,
                        attackDetails: []
                    }
                }
                
                const displayedPenaltyDmg = isPartyMode ? 10 : penaltyDmg
                attackResults[playerName].totalDmg += displayedPenaltyDmg
                attackResults[playerName].attackDetails.push({
                    attacker: 'Strafhitze',
                    dmg: displayedPenaltyDmg,
                    isPenalty: true
                })
            }
        })
        
        // Erstelle Attack-Ergebnisse für ALLE Spieler
        // WICHTIG: Auch Spieler ohne Schaden bekommen ein Ergebnis (für "cool geblieben" Popup)
        allPlayers.forEach(playerName => {
            if (!attackResults[playerName]) {
                attackResults[playerName] = {
                    attackers: [],
                    totalDmg: 0,
                    attackDetails: []
                }
            }
        })
        
        // ATOMARES UPDATE: Nur spezifische Felder aktualisieren
        const updateData = {
            pendingAttacks: {},
            attackResults: attackResults,
            roundRecapShown: true
        }
        
        if (logEntries.length > 0) {
            updateData.log = arrayUnion(...logEntries)
        }
        
        // Konvertiere tempUpdates zu Firebase-Format (increment für atomare Updates)
        for (const [path, dmg] of Object.entries(tempUpdates)) {
            const parts = path.split('.')
            if (parts.length === 3 && parts[0] === 'players' && parts[2] === 'temp') {
                const playerName = parts[1]
                updateData[`players.${playerName}.temp`] = increment(dmg)
            }
        }
        
        await updateDoc(doc(db, "lobbies", roomId), updateData)
        
        // Nach executePendingAttacks: Prüfe ob alle Popups bestätigt wurden, dann automatisch weiter
        // Dies wird durch den Listener gehandhabt, der auf roundRecapShown reagiert
    }
    
    // Eiswürfel-Automatik: Kühle Spieler mit Eiswürfel ab
    const applyIceCooling = async (players) => {
        if (!players || !db || !roomId) return
        const coolValue = globalData?.config?.dmg || 10
        const ref = doc(db, "lobbies", roomId)
        
        for (const name of Object.keys(players)) {
            if (players[name].inventory?.includes('card_ice')) {
                const reduction = Math.min(coolValue, players[name].temp || 0)
                if (reduction > 0) {
                    await updateDoc(ref, {
                        [`players.${name}.temp`]: increment(-reduction),
                        [`players.${name}.inventory`]: arrayRemove('card_ice'),
                        log: arrayUnion(`🧊 ${name} kühlt sich ab (-${reduction}°C)`)
                    })
                }
            }
        }
    }
    
    // Host: Runde erzwingen
    const forceNextRound = async () => {
        if (!isHost || !db || !roomId) return
        if (!window.confirm("Möchtest du wirklich zur nächsten Runde springen?")) return
        await nextRound()
        setMenuOpen(false)
    }
    
    // Host: Spiel neustarten
    const resetGame = async () => {
        if (!isHost || !db || !roomId) return
        if (!window.confirm("Möchtest du das Spiel wirklich neustarten? Alle Temperaturen werden zurückgesetzt.")) return
        
        const pClean = {}
        Object.keys(globalData?.players || {}).forEach(p => {
            pClean[p] = { temp: 0, inventory: [], emoji: globalData?.players[p]?.emoji || '😊' }
        })
        
        await updateDoc(doc(db, "lobbies", roomId), {
            status: 'lobby',
            players: pClean,
            votes: deleteField(),
            ready: [],
            log: [],
            hotseat: "",
            roundId: 0,
            lobbyReady: {},
            countdownEnds: null,
            usedQuestions: [],
            pendingAttacks: deleteField(),
            attackResults: deleteField(),
            popupConfirmed: deleteField()
        })
        setMenuOpen(false)
    }
    
    // Host: Lobby löschen
    const killLobby = async () => {
        if (!isHost || !db || !roomId) return
        if (!window.confirm("Lobby wirklich löschen? Alle Spieler werden ausgeworfen und die Lobby ist danach nicht mehr verfügbar!")) return
        const ref = doc(db, "lobbies", roomId)
        await deleteDoc(ref)
        console.log('Lobby gelöscht:', roomId)
        setMenuOpen(false)
    }
    
    // Revanche starten
    const rematchGame = async () => {
        if (!globalData || !db || !roomId) return
        if (globalData.host !== myName) {
            alert("Nur der Host kann eine Revanche starten.")
            return
        }
        if (!window.confirm("Möchtest du eine Revanche starten? Alle Temperaturen werden zurückgesetzt.")) return
        
        const pClean = {}
        Object.keys(globalData.players || {}).forEach(p => {
            pClean[p] = { 
                temp: 0, 
                inventory: [], 
                emoji: globalData.players[p]?.emoji || '😊' 
            }
        })
        
        await updateDoc(doc(db, "lobbies", roomId), {
            status: 'lobby',
            players: pClean,
            votes: deleteField(),
            ready: [],
            log: arrayUnion("♻️ Revanche gestartet! Alle Temperaturen wurden zurückgesetzt."),
            hotseat: "",
            roundId: (globalData.roundId ?? 0) + 1,
            lobbyReady: {},
            countdownEnds: null,
            usedQuestions: [],
            pendingAttacks: deleteField(),
            attackResults: deleteField(),
            popupConfirmed: deleteField()
        })
        alert("Revanche gestartet! Alle zurück in die Lobby.")
    }
    
    // Belohnung wählen (Strategic Mode)
    const chooseReward = (rewardType) => {
        if (rewardType === 'attack') {
            setShowRewardChoice(false)
            setShowAttackSelection(true)
        } else if (rewardType === 'invest') {
            setShowRewardChoice(false)
            setShowJokerShop(true)
        }
    }
    
    // Joker-Karte ziehen
    const takeCard = async (card) => {
        if (!db || !roomId) return
        
        setLocalActionDone(true)
        setShowRewardChoice(false)
        setShowJokerShop(false)
        
        const inventory = globalData?.players?.[myName]?.inventory || []
        if (inventory.includes(card)) {
            alert("Du besitzt diesen Joker bereits! Du kannst jeden Joker nur einmal haben.")
            return
        }
        
        const cardInfo = {
            card_oil: { label: '🛢️ Ölfass', desc: 'Verdoppelt deinen nächsten Angriff.' },
            card_mirror: { label: '🪞 Spiegel', desc: 'Der nächste Angriff prallt zurück.' },
            card_ice: { label: '🧊 Eiswürfel', desc: 'Kühlt dich in der nächsten Runde automatisch ab.' }
        }
        
        await updateDoc(doc(db, "lobbies", roomId), {
            [`players.${myName}.inventory`]: arrayUnion(card),
            log: arrayUnion(`🃏 ${myName} zieht eine geheime Karte.`)
        })
        
        const info = cardInfo[card] || { label: '🃏 Joker', desc: '' }
        alert(`${info.label} erhalten! ${info.desc}`)
    }
    
    // Angriff überspringen
    const skipAttack = async () => {
        if (!db || !roomId) return
        
        setLocalActionDone(true)
        setShowRewardChoice(false)
        setShowAttackSelection(false)
        
        const ref = doc(db, "lobbies", roomId)
        const currentData = await getDoc(ref)
        const currentAttackDecisions = currentData.data()?.attackDecisions || {}
        const updatedAttackDecisions = {
            ...currentAttackDecisions,
            [myName]: true
        }
        
        await updateDoc(ref, {
            log: arrayUnion(`🕊️ ${myName} verzichtet auf einen Angriff.`),
            attackDecisions: updatedAttackDecisions
        })
    }

  return (
        <div className="App">
            {currentScreen !== 'landing' && (
                <div className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>⚙️</div>
            )}
            
            {menuOpen && (
    <>
                    <div className="overlay open" onClick={() => setMenuOpen(false)}></div>
                    <div className={`admin-drawer ${menuOpen ? 'open' : ''}`}>
                        <h3 style={{color: '#ff4500', borderBottom: '2px solid #333', paddingBottom: '12px', marginBottom: '15px'}}>⚙️ Menü</h3>
                        
                        {isHost && (
      <div>
                                <p style={{fontSize: '0.75rem', color: '#888', marginBottom: '8px', textTransform: 'uppercase'}}>Host-Steuerung:</p>
                                <button onClick={forceNextRound} style={{padding: '12px', fontSize: '0.85rem', margin: '8px 0', background: '#333', borderRadius: '8px', width: '100%'}}>⏩ Runde erzwingen</button>
                                <button onClick={resetGame} style={{padding: '12px', fontSize: '0.85rem', margin: '8px 0', background: '#550000', borderRadius: '8px', width: '100%'}}>🔄 Spiel neustarten</button>
                                <button onClick={killLobby} style={{padding: '12px', fontSize: '0.85rem', margin: '8px 0', background: '#880000', borderRadius: '8px', width: '100%'}}>🧨 Lobby löschen</button>
                                <hr style={{border: 'none', borderTop: '1px solid #333', margin: '20px 0'}} />
      </div>
                        )}
                        
                        <hr style={{border: 'none', borderTop: '1px solid #333', margin: '20px 0'}} />
                        <p style={{fontSize: '0.75rem', color: '#888', marginBottom: '8px', textTransform: 'uppercase'}}>Spielverlauf:</p>
                        <div style={{maxHeight: '200px', fontSize: '0.75rem', marginBottom: '15px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px'}}>
                            {globalData?.log && globalData.log.length > 0 ? (
                                globalData.log.slice(-10).map((entry, idx) => (
                                    <div key={idx} style={{marginBottom: '5px', color: '#aaa'}}>{entry}</div>
                                ))
                            ) : (
                                <div style={{color: '#666'}}>Keine Einträge</div>
                            )}
                        </div>
                        
                        <button onClick={leaveLobby} style={{padding: '12px', fontSize: '0.85rem', margin: '8px 0', background: '#444', borderRadius: '8px', width: '100%'}}>👋 Lobby verlassen</button>
      </div>
                </>
            )}
            
            {currentScreen !== 'landing' && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: '20px',
                    marginTop: '10px'
                }}>
                    <img 
                        src={hkLogoHorizontal} 
                        alt="Hitzkopf Logo" 
                        style={{
                            maxWidth: '300px',
                            width: 'auto',
                            height: 'auto',
                            maxHeight: '80px',
                            objectFit: 'contain'
                        }}
                    />
                </div>
            )}
            
            {/* LANDING PAGE */}
            {currentScreen === 'landing' && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    
                    {/* Logo in der Mitte */}
                    <div style={{
                        position: 'relative',
                        zIndex: 2,
                        marginBottom: '60px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        <img 
                            src={hkLogo} 
                            alt="Hitzkopf Logo" 
                            style={{
                                maxWidth: '300px',
                                width: '80%',
                                height: 'auto',
                                objectFit: 'contain'
                            }}
                        />
                    </div>
                    
                    {/* Spielen Button */}
                    <button
                        onClick={() => setCurrentScreen('start')}
                        style={{
                            position: 'relative',
                            zIndex: 2,
                            padding: '16px 40px',
                            fontSize: '1.3rem',
                            fontWeight: 'bold',
                            color: '#fff',
                            background: '#ff6b35',
                            border: 'none',
                            borderRadius: '25px',
                            cursor: 'pointer',
                            boxShadow: '0 6px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                            transition: 'all 0.2s ease',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            width: 'auto',
                            minWidth: '200px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)'
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                            e.currentTarget.style.background = '#ff7a4a'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = '0 6px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                            e.currentTarget.style.background = '#ff6b35'
                        }}
                        onMouseDown={(e) => {
                            e.currentTarget.style.transform = 'translateY(1px)'
                            e.currentTarget.style.boxShadow = '0 3px 10px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        }}
                        onMouseUp={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)'
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                        }}
                    >
                        SPIELEN
                    </button>
                </div>
            )}
            
            {/* START SCREEN */}
            {currentScreen === 'start' && (
                <div className="screen active card">
                    <h3 style={{marginBottom: '15px', color: '#ff8c00'}}>Wie heißt du?</h3>
                    <label htmlFor="playerName" style={{display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '8px', fontWeight: '500'}}>
                        Dein Name:
                    </label>
                    <input 
                        id="playerName"
                        name="playerName"
                        type="text" 
                        value={myName}
                        onChange={handleNameChange}
                        placeholder="Dein Name" 
                        maxLength={20} 
                        autoComplete="name"
                    />
                    <label htmlFor="playerEmoji" style={{display: 'block', fontSize: '0.85rem', color: '#aaa', marginTop: '15px', marginBottom: '8px', fontWeight: '500'}}>
                        Wähle deinen Charakter:
                    </label>
                    <div className="emoji-gallery-wrapper" style={{
                        position: 'relative', 
                        marginBottom: '15px', 
                        padding: '0', 
                        margin: '0 0 15px 0',
                        width: 'calc(100% + 48px)',
                        marginLeft: '-24px',
                        marginRight: '-24px',
                        paddingLeft: '24px',
                        paddingRight: '24px',
                        overflow: 'visible'
                    }}>
                        <div 
                            ref={emojiGalleryRef}
                            id="emojiGallery" 
                            style={{
                                display: 'flex', 
                                gap: '10px', 
                                overflowX: 'auto', 
                                overflowY: 'hidden', 
                                padding: '10px 0', 
                                scrollBehavior: 'smooth', 
                                width: '100%', 
                                maxWidth: '100%',
                                scrollbarWidth: 'thin',
                                scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
                                msOverflowStyle: 'auto',
                                WebkitOverflowScrolling: 'touch',
                                margin: '0',
                                paddingLeft: '0',
                                paddingRight: '0',
                                cursor: 'grab'
                            }}
                            onMouseDown={(e) => {
                                e.currentTarget.style.cursor = 'grabbing'
                            }}
                            onMouseUp={(e) => {
                                e.currentTarget.style.cursor = 'grab'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.cursor = 'grab'
                            }}
                        >
                            <div className="emoji-spacer" style={{minWidth: 'calc(50% - 60px)'}}></div>
                            {availableEmojis.map((emoji, index) => (
                                <div
                                    key={emoji}
                                    className={`emoji-card ${index === emojiScrollIndex ? 'selected' : ''}`}
                                    onClick={() => selectEmoji(emoji)}
                                    data-emoji={emoji}
                                    data-index={index}
                                >
                                    {emoji}
                                </div>
                            ))}
                            <div className="emoji-spacer" style={{minWidth: 'calc(50% - 60px)'}}></div>
                        </div>
                    </div>
                    
                    <div className="start-actions">
                        <button className="btn-primary" onClick={() => setCurrentScreen('create')}>
                            🎮 Spiel erstellen
                        </button>
                        <button className="btn-secondary" onClick={() => { setCurrentScreen('join'); loadRoomList(); }}>
                            🚪 Spiel beitreten
                        </button>
                    </div>
                    
                    {/* Anleitung Button außerhalb des Cards */}
                    <button 
                        className="btn-secondary" 
                        onClick={() => setShowRulesModal(true)} 
                        style={{
                            marginTop: '20px',
                            width: '100%',
                            maxWidth: '480px',
                            marginLeft: 'auto',
                            marginRight: 'auto'
                        }}
                    >
                        📖 Anleitung
                    </button>
                </div>
            )}
            
            {/* CREATE GAME SCREEN */}
            {currentScreen === 'create' && (
                <div className="screen active card">
                    <button 
                        onClick={() => setCurrentScreen('start')}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            left: '20px',
                            background: 'rgba(22, 27, 34, 0.8)',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        ← Zurück
                    </button>
                    <h3 style={{marginBottom: '15px', color: '#ff8c00'}}>⚙️ Host-Einstellungen</h3>
                    <label style={{display: 'block', fontSize: '0.85rem', color: '#aaa', marginBottom: '5px', fontWeight: '500'}}>Spielmodus:</label>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '10px', marginBottom: '15px'}}>
                        <div className={`game-mode-card ${gameMode === 'party' ? 'selected' : ''}`} onClick={() => setGameMode('party')}>
                            <div className="mode-emoji">⚡</div>
                            <div className="mode-name">Party-Modus</div>
                        </div>
                        <div className={`game-mode-card ${gameMode === 'strategisch' ? 'selected' : ''}`} onClick={() => setGameMode('strategisch')}>
                            <div className="mode-emoji">🕐</div>
                            <div className="mode-name">Strategie-Modus</div>
                        </div>
                    </div>
                    <label style={{display: 'block', fontSize: '0.85rem', color: '#aaa', marginTop: '12px', marginBottom: '5px', fontWeight: '500'}}>
                        Wähle Fragenkategorien:
                    </label>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '10px', marginBottom: '15px'}}>
                        <div className={`category-card ${selectedCategories.length === Object.keys(questionCategories).length ? 'selected' : ''}`} onClick={() => toggleCategory('all')}>
                            <div className="category-emoji">🌟</div>
                            <div className="category-name">Alle</div>
                        </div>
                        {Object.entries(questionCategories).map(([key, cat]) => (
                            <div key={key} className={`category-card ${selectedCategories.includes(key) ? 'selected' : ''}`} onClick={() => toggleCategory(key)}>
                                <div className="category-emoji">{cat.emoji}</div>
                                <div className="category-name">{cat.name}</div>
                            </div>
                        ))}
                    </div>
                    <label htmlFor="roomPassword" style={{display: 'block', fontSize: '0.85rem', color: '#aaa', marginTop: '15px', marginBottom: '5px', fontWeight: '500'}}>
                        🔒 Raum-Passwort (optional):
                    </label>
                    <input 
                        id="roomPassword"
                        name="roomPassword"
                        type="password" 
                        value={roomPassword}
                        onChange={(e) => setRoomPassword(e.target.value)}
                        placeholder="Leer lassen für öffentlichen Raum" 
                        style={{marginBottom: '15px'}} 
                        autoComplete="new-password"
                    />
                    <button className="btn-primary" onClick={createGame} style={{marginTop: '15px'}}>
                        🎮 Spiel erstellen
                    </button>
                </div>
            )}
            
            {/* JOIN GAME SCREEN */}
            {currentScreen === 'join' && (
                <div className="screen active card">
                    <button 
                        onClick={() => setCurrentScreen('start')}
                        style={{
                            position: 'absolute',
                            top: '20px',
                            left: '20px',
                            background: 'rgba(22, 27, 34, 0.8)',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        ← Zurück
                    </button>
                    <h3 style={{marginBottom: '15px', color: '#ff8c00'}}>🤝 Spiel beitreten</h3>
                    <button className="btn-secondary" onClick={loadRoomList} style={{marginBottom: '15px', fontSize: '0.9rem', padding: '10px'}}>
                        🔄 Räume aktualisieren
                    </button>
                    {roomList.length > 0 ? (
                        <div style={{maxHeight: '300px', overflowY: 'auto', marginBottom: '15px'}}>
                            {roomList.map((room) => (
                                <div 
                                    key={room.id} 
                                    style={{
                                        padding: '12px', 
                                        margin: '8px 0', 
                                        background: roomCode === room.id ? 'rgba(255, 140, 0, 0.2)' : 'rgba(22, 27, 34, 0.6)', 
                                        borderRadius: '10px', 
                                        cursor: 'pointer',
                                        border: roomCode === room.id ? '2px solid #ff8c00' : '2px solid transparent'
                                    }} 
                                    onClick={() => selectRoom(room.id, room.hasPassword)}
                                >
                                    <strong>{room.hostName}</strong> - {room.playerCount} Spieler {room.hasPassword && '🔒'}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{color: '#666', fontSize: '0.9rem', marginBottom: '15px'}}>Keine Räume verfügbar</p>
                    )}
                    {roomCode && (
                        <>
                            {roomList.find(r => r.id === roomCode)?.hasPassword && (
                                <>
                                    <label htmlFor="joinPassword" style={{display: 'block', fontSize: '0.85rem', color: '#aaa', marginTop: '10px', marginBottom: '5px', fontWeight: '500'}}>
                                        Passwort:
                                    </label>
                                    <input 
                                        id="joinPassword"
                                        name="joinPassword"
                                        type="password" 
                                        value={joinPassword}
                                        onChange={(e) => setJoinPassword(e.target.value)}
                                        placeholder="Passwort eingeben" 
                                        style={{marginBottom: '10px'}} 
                                        autoComplete="current-password"
                                    />
                                </>
                            )}
                            <button className="btn-secondary" onClick={() => joinGame(roomCode)}>
                                🚪 Beitreten
                            </button>
                        </>
                    )}
                </div>
            )}
            
            {/* LOBBY SCREEN */}
            {currentScreen === 'lobby' && globalData && (
                <div className="screen active card">
                    <h3 style={{marginBottom: '15px', color: '#ff8c00'}}>👥 Lobby</h3>
                    <div style={{margin: '20px 0', fontWeight: 'bold', fontSize: '1rem', color: '#fff'}}>
                        {renderPlayers().map((p, idx) => (
                            <div key={p.name} style={{margin: '8px 0', padding: '8px', background: 'rgba(22, 27, 34, 0.6)', borderRadius: '8px'}}>
                                {p.emoji} {p.name} {globalData.host === p.name && '👑'}
                            </div>
                        ))}
                    </div>
                    <div style={{margin: '20px 0'}}>
                        <div style={{marginBottom: '10px', color: '#aaa', fontSize: '0.9rem'}}>
                            Bereit: {Object.values(globalData.lobbyReady || {}).filter(r => r).length}/{renderPlayers().length}
                        </div>
                        <div style={{marginBottom: '15px', fontSize: '0.85rem', color: '#666'}}>
                            {Object.entries(globalData.lobbyReady || {}).map(([name, ready]) => (
                                <div key={name} style={{margin: '4px 0'}}>
                                    {ready ? '✅' : '⏳'} {name}
                                </div>
                            ))}
                        </div>
                    </div>
                    <button 
                        className={globalData.lobbyReady?.[myName] ? 'btn-secondary' : 'btn-primary'} 
                        onClick={toggleLobbyReady}
                        style={{marginBottom: '10px'}}
                    >
                        {globalData.lobbyReady?.[myName] ? '❌ Nicht bereit' : '✅ Bereit'}
                    </button>
                    {isHost && (
                        <button 
                            className="btn-primary" 
                            onClick={startCountdown} 
                            style={{marginTop: '10px'}}
                            disabled={
                                Object.values(globalData.lobbyReady || {}).filter(r => r).length < renderPlayers().length ||
                                renderPlayers().length < 2
                            }
                        >
                            🔥 Spiel starten
                        </button>
                    )}
                    {!isHost && (
                        <p style={{color: '#666', fontSize: '0.9rem', marginTop: '15px'}}>⏳ Warte auf Host...</p>
                    )}
                </div>
            )}
            
            {/* GAME SCREEN */}
            {currentScreen === 'game' && globalData && (() => {
                // PERFORMANCE-FIX: Memoize hotseat-Status, damit sich Markierung nicht ändert, wenn nur Votes geändert werden
                const currentHotseat = globalData.hotseat
                const maxTemp = globalData.config?.maxTemp || 100
                
                return (
                <div className="screen active card">
                    
                    <div className="thermo-grid">
                        {renderPlayers().map((player) => {
                            const tempPercent = Math.min((player.temp / maxTemp) * 100, 100)
                            // WICHTIG: isHotseat nur basierend auf currentHotseat berechnen, nicht auf globalData.hotseat
                            // Das verhindert unnötige Re-Renders, wenn sich nur Votes ändern
                            const isHotseat = player.name === currentHotseat
                            
                            return (
                                <div key={player.name} className={`thermo-item ${isHotseat ? 'is-hotseat' : ''}`} style={{
                                    border: isHotseat ? '2px solid #ff8c00' : '1px solid #333',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    background: 'rgba(22, 27, 34, 0.6)'
                                }}>
                                    <div className="thermo-top" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                        <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                            {isHotseat && <span style={{color: '#ff8c00'}}>🔥</span>}
                                            <span>{player.emoji} {player.name}</span>
                                        </span>
                                        <span style={{fontWeight: 'bold', color: tempPercent >= 100 ? '#ff0000' : '#fff'}}>{player.temp}°C</span>
                                    </div>
                                    <div className="thermo-bar" style={{
                                        width: '100%',
                                        height: '20px',
                                        background: '#333',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        position: 'relative'
                                    }}>
                                        <div className="thermo-fill" style={{
                                            width: `${tempPercent}%`,
                                            height: '100%',
                                            background: (() => {
                                                // Farbverlauf: Blau (0°) → Gelb (50°) → Orange (75°) → Rot (100°)
                                                if (tempPercent >= 100) {
                                                    return 'linear-gradient(90deg, #ff0000, #ff4500)'
                                                } else if (tempPercent >= 75) {
                                                    return 'linear-gradient(90deg, #ff8c00, #ff4500, #ff0000)'
                                                } else if (tempPercent >= 50) {
                                                    return 'linear-gradient(90deg, #ffae00, #ff8c00, #ff4500)'
                                                } else if (tempPercent >= 25) {
                                                    return 'linear-gradient(90deg, #4a9eff, #ffae00, #ff8c00)'
                                                } else {
                                                    return 'linear-gradient(90deg, #4a9eff, #0066cc)'
                                                }
                                            })(),
                                            transition: 'width 0.5s ease-out',
                                            boxShadow: tempPercent >= 100 ? '0 0 10px rgba(255, 0, 0, 0.5)' : 'none'
                                        }}></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <hr style={{borderColor: '#333', margin: '15px 0'}} />
                    {/* Hotseat-Hinweis über der Frage */}
                    {(() => {
                        const isHotseat = myName === currentHotseat
                        const hotseatPlayer = currentHotseat ? renderPlayers().find(p => p.name === currentHotseat) : null
                        const hotseatName = hotseatPlayer?.name || currentHotseat || 'Hotseat'
                        const hotseatEmoji = hotseatPlayer?.emoji || '🔥'
                        return (
                            <div style={{
                                marginBottom: '15px',
                                padding: '10px 15px',
                                background: isHotseat ? 'rgba(255, 140, 0, 0.2)' : 'rgba(22, 27, 34, 0.6)',
                                border: isHotseat ? '2px solid #ff8c00' : '1px solid #333',
                                borderRadius: '10px',
                                textAlign: 'center'
                            }}>
                                <p style={{
                                    margin: 0,
                                    color: isHotseat ? '#ff8c00' : '#aaa',
                                    fontSize: '0.95rem',
                                    fontWeight: isHotseat ? 'bold' : 'normal'
                                }}>
                                    {isHotseat ? (
                                        <>🔥 Du bist gefragt! <br/>Antworte ehrlich - die anderen versuchen deine Wahl zu erraten.</>
                                    ) : (
                                        <>Rate, was {hotseatEmoji} <strong>{hotseatName}</strong> gewählt hat.</>
                                    )}
                                </p>
                            </div>
                        )
                    })()}
                    <h3 style={{margin: '20px 0', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
                        {globalData.currentQ?.q || 'Lade Frage...'}
                    </h3>
                    {/* Kategorie anzeigen */}
                    {globalData.currentQ?.category && (
                        <div style={{
                            marginTop: '10px',
                            marginBottom: '20px',
                            color: '#888',
                            fontSize: '0.9rem',
                            textAlign: 'center',
                            fontStyle: 'italic'
                        }}>
                            {questionCategories[globalData.currentQ.category]?.emoji} {questionCategories[globalData.currentQ.category]?.name}
                        </div>
                    )}
                    {globalData.votes?.[myName] ? (
                        <div style={{padding: '20px', background: 'rgba(255, 140, 0, 0.2)', borderRadius: '10px', marginTop: '20px'}}>
                            <p style={{color: '#ff8c00', fontWeight: 'bold'}}>✅ Antwort abgesendet!</p>
                            <p style={{color: '#aaa', fontSize: '0.9rem', marginTop: '10px'}}>Warte auf andere Spieler...</p>
                        </div>
                    ) : (
                        <>
                            <div className="option-row">
                                <button 
                                    className={`btn-option ${mySelection === 'A' ? 'selected' : ''}`} 
                                    onClick={() => vote('A')}
                                >
                                    {globalData.currentQ?.a || 'A'}
                                </button>
                                <button 
                                    className={`btn-option ${mySelection === 'B' ? 'selected' : ''}`} 
                                    onClick={() => vote('B')}
                                >
                                    {globalData.currentQ?.b || 'B'}
                                </button>
                            </div>
                            <button 
                                className="btn-primary" 
                                onClick={submitVote} 
                                style={{marginTop: '20px'}}
                                disabled={!mySelection}
                            >
                                🔒 Antwort absenden
                            </button>
                        </>
                    )}
                </div>
                )
            })()}
            
            {/* RESULT SCREEN */}
            {currentScreen === 'result' && globalData && (() => {
                // WICHTIG: Definiere isHotseat hier im Scope, damit es im JSX verwendet werden kann
                const isHotseat = myName === globalData.hotseat
                return (
                <div className="screen active card">
                    <h3 style={{marginBottom: '15px', color: '#ff8c00'}}>📊 Ergebnis</h3>
                    <div className="thermo-grid">
                        {renderPlayers().map((player) => {
                            const maxTemp = globalData.config?.maxTemp || 100
                            const tempPercent = Math.min((player.temp / maxTemp) * 100, 100)
                            
                            return (
                                <div key={player.name} className="thermo-item" style={{
                                    border: '1px solid #333',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    background: 'rgba(22, 27, 34, 0.6)'
                                }}>
                                    <div className="thermo-top" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                                        <span>{player.emoji} {player.name}</span>
                                        <span style={{fontWeight: 'bold', color: tempPercent >= 100 ? '#ff0000' : '#fff'}}>{player.temp}°C</span>
                                    </div>
                                    <div className="thermo-bar" style={{
                                        width: '100%',
                                        height: '20px',
                                        background: '#333',
                                        borderRadius: '10px',
                                        overflow: 'hidden'
                                    }}>
                                        <div className="thermo-fill" style={{
                                            width: `${tempPercent}%`,
                                            height: '100%',
                                            background: (() => {
                                                // Farbverlauf: Blau (0°) → Gelb (50°) → Orange (75°) → Rot (100°)
                                                if (tempPercent >= 100) {
                                                    return 'linear-gradient(90deg, #ff0000, #ff4500)'
                                                } else if (tempPercent >= 75) {
                                                    return 'linear-gradient(90deg, #ff8c00, #ff4500, #ff0000)'
                                                } else if (tempPercent >= 50) {
                                                    return 'linear-gradient(90deg, #ffae00, #ff8c00, #ff4500)'
                                                } else if (tempPercent >= 25) {
                                                    return 'linear-gradient(90deg, #4a9eff, #ffae00, #ff8c00)'
                                                } else {
                                                    return 'linear-gradient(90deg, #4a9eff, #0066cc)'
                                                }
                                            })(),
                                            transition: 'width 0.5s ease-out'
                                        }}></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    
                    {/* Status-Anzeige */}
                    {(() => {
                        const truth = globalData.votes?.[globalData.hotseat]?.choice
                        const myVote = globalData.votes?.[myName]
                        const gameMode = globalData.config?.gameMode || 'party'
                        const isPartyMode = gameMode === 'party'
                        const isHotseat = myName === globalData.hotseat
                        
                        if (isHotseat) {
                            return (
                                <div style={{margin: '20px 0', padding: '15px', background: 'rgba(22, 27, 34, 0.6)', borderRadius: '10px'}}>
                                    <p style={{color: '#aaa'}}>Du hast die Frage beantwortet.</p>
                                </div>
                            )
                        } else if (myVote && truth !== undefined && truth !== null && String(myVote.choice) === String(truth)) {
                            // Richtig geraten - Belohnung wählen (Strategic Mode) oder Angriff (Party Mode)
                            const attackDecisions = globalData.attackDecisions || {}
                            
                            if (!localActionDone && isPartyMode) {
                                return (
                                    <div style={{margin: '20px 0'}}>
                                        <p style={{color: '#0f0', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '10px'}}>✅ RICHTIG GERATEN!</p>
                                        <p style={{color: '#aaa', fontSize: '0.9rem', marginBottom: '15px'}}>Wähle einen Spieler zum Aufheizen!</p>
                                        
                                        {/* Kategorie anzeigen */}
                                        {globalData.currentQ?.category && (
                                            <div style={{marginBottom: '15px', color: '#888', fontSize: '0.85rem'}}>
                                                {questionCategories[globalData.currentQ.category]?.emoji} {questionCategories[globalData.currentQ.category]?.name}
                                            </div>
                                        )}
                                        
                                        {/* Angriffsauswahl Container */}
                                        <div style={{
                                            background: 'rgba(139, 0, 0, 0.3)',
                                            borderRadius: '15px',
                                            padding: '20px',
                                            marginTop: '15px',
                                            border: '2px solid rgba(255, 69, 0, 0.5)'
                                        }}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', color: '#ff8c00', fontWeight: 'bold'}}>
                                                <span style={{fontSize: '1.2rem'}}>🔥</span>
                                                <span>Wen aufheizen?</span>
                                            </div>
                                            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px'}}>
                                                {renderPlayers().filter(p => p.name !== myName).map((player) => {
                                                    const baseDmg = isPartyMode ? 20 : (globalData.config?.dmg || 10)
                                                    const attackerState = globalData.players?.[myName] || {}
                                                    const hasOil = attackerState.inventory?.includes('card_oil')
                                                    const dmg = baseDmg * (hasOil ? 2 : 1)
                                                    
                                                    return (
                                                        <div
                                                            key={player.name}
                                                            onClick={() => doAttack(player.name)}
                                                            style={{
                                                                padding: '20px',
                                                                background: 'rgba(22, 27, 34, 0.8)',
                                                                borderRadius: '12px',
                                                                cursor: 'pointer',
                                                                textAlign: 'center',
                                                                border: '2px solid #444',
                                                                transition: 'all 0.2s',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                alignItems: 'center',
                                                                gap: '8px'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.border = '2px solid #ff8c00'
                                                                e.currentTarget.style.background = 'rgba(255, 140, 0, 0.1)'
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.border = '2px solid #444'
                                                                e.currentTarget.style.background = 'rgba(22, 27, 34, 0.8)'
                                                            }}
                                                        >
                                                            <div style={{fontSize: '3rem', marginBottom: '5px'}}>{player.emoji}</div>
                                                            <div style={{fontSize: '1rem', fontWeight: 'bold', color: '#fff', marginBottom: '5px'}}>{player.name}</div>
                                                            <div style={{fontSize: '0.9rem', color: '#ff8c00', fontWeight: 'bold'}}>+{dmg}°</div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )
                            } else if (!localActionDone && !isPartyMode) {
                                // Strategic Mode: Belohnung wählen
                                return (
                                    <div style={{margin: '20px 0'}}>
                                        <p style={{color: '#0f0', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '10px'}}>✅ RICHTIG GERATEN!</p>
                                        
                                        {showRewardChoice && (
                                            <div style={{background: '#2a3a1a', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: '2px solid #4a6a2a'}}>
                                                <h4 style={{margin: '0 0 12px 0', color: '#8fef8f'}}>🎁 Belohnung wählen:</h4>
                                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                                                    <button 
                                                        onClick={() => chooseReward('attack')}
                                                        style={{
                                                            background: 'linear-gradient(135deg, #dc3545, #c82333)',
                                                            color: 'white',
                                                            padding: '20px',
                                                            borderRadius: '10px',
                                                            border: 'none',
                                                            fontSize: '1.1rem',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        🔴 Gegner aufheizen
                                                    </button>
                                                    <button 
                                                        onClick={() => chooseReward('invest')}
                                                        style={{
                                                            background: 'linear-gradient(135deg, #1a2a3a, #2a3a4a)',
                                                            color: 'white',
                                                            padding: '20px',
                                                            borderRadius: '10px',
                                                            border: 'none',
                                                            fontSize: '1.1rem',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        🃏 Joker ziehen
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {showAttackSelection && (
                                            <div style={{background: '#3a1a1a', padding: '10px', borderRadius: '10px', marginBottom: '15px'}}>
                                                <h4 style={{margin: '0 0 10px 0'}}>🔥 Wen aufheizen?</h4>
                                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', marginTop: '10px'}}>
                                                    {renderPlayers().filter(p => p.name !== myName).map((player) => {
                                                        const baseDmg = globalData.config?.dmg || 10
                                                        const attackerState = globalData.players?.[myName] || {}
                                                        const hasOil = attackerState.inventory?.includes('card_oil')
                                                        const dmg = baseDmg * (hasOil ? 2 : 1)
                                                        
                                                        return (
                                                            <div
                                                                key={player.name}
                                                                onClick={() => doAttack(player.name)}
                                                                style={{
                                                                    padding: '15px',
                                                                    background: 'rgba(22, 27, 34, 0.8)',
                                                                    borderRadius: '10px',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'center',
                                                                    border: '2px solid #444'
                                                                }}
                                                            >
                                                                <div style={{fontSize: '2rem', marginBottom: '5px'}}>{player.emoji}</div>
                                                                <div style={{fontSize: '0.9rem', fontWeight: 'bold', color: '#fff'}}>{player.name}</div>
                                                                <div style={{fontSize: '0.8rem', color: '#ff8c00'}}>+{dmg}°</div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                <div style={{display: 'flex', gap: '5px', marginTop: '10px'}}>
                                                    <button 
                                                        onClick={() => { setShowAttackSelection(false); setShowRewardChoice(true); }}
                                                        style={{flex: 1, background: 'transparent', border: '1px solid #666', color: '#aaa', fontSize: '0.85rem', padding: '8px'}}
                                                    >
                                                        ← Zurück
                                                    </button>
                                                    <button 
                                                        onClick={skipAttack}
                                                        style={{flex: 1, background: 'transparent', border: '1px solid #666', color: '#aaa', fontSize: '0.85rem', padding: '8px'}}
                                                    >
                                                        Angriff überspringen
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {showJokerShop && (
                                            <div style={{background: '#1a2a3a', padding: '10px', borderRadius: '10px', marginBottom: '15px'}}>
                                                <h4 style={{margin: '0 0 10px 0'}}>🃏 Joker-Karte wählen:</h4>
                                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'}}>
                                                    <button 
                                                        onClick={() => takeCard('card_oil')}
                                                        style={{
                                                            padding: '15px',
                                                            background: 'rgba(22, 27, 34, 0.8)',
                                                            borderRadius: '10px',
                                                            border: '2px solid #444',
                                                            cursor: 'pointer',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        <strong style={{display: 'block', marginBottom: '5px'}}>🛢️ Ölfass</strong>
                                                        <span style={{fontSize: '0.8rem', color: '#aaa'}}>Verdoppelt deinen nächsten Angriff.</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => takeCard('card_mirror')}
                                                        style={{
                                                            padding: '15px',
                                                            background: 'rgba(22, 27, 34, 0.8)',
                                                            borderRadius: '10px',
                                                            border: '2px solid #444',
                                                            cursor: 'pointer',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        <strong style={{display: 'block', marginBottom: '5px'}}>🪞 Spiegel</strong>
                                                        <span style={{fontSize: '0.8rem', color: '#aaa'}}>Der nächste Angriff prallt zurück.</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => takeCard('card_ice')}
                                                        style={{
                                                            padding: '15px',
                                                            background: 'rgba(22, 27, 34, 0.8)',
                                                            borderRadius: '10px',
                                                            border: '2px solid #444',
                                                            cursor: 'pointer',
                                                            textAlign: 'center'
                                                        }}
                                                    >
                                                        <strong style={{display: 'block', marginBottom: '5px'}}>🧊 Eiswürfel</strong>
                                                        <span style={{fontSize: '0.8rem', color: '#aaa'}}>Kühlt dich in der nächsten Runde automatisch ab.</span>
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => { setShowJokerShop(false); setShowRewardChoice(true); }}
                                                    style={{width: '100%', background: 'transparent', border: '1px solid #666', color: '#aaa', fontSize: '0.85rem', marginTop: '10px', padding: '8px'}}
                                                >
                                                    ← Zurück
                                                </button>
                                            </div>
                                        )}
                                        
                                        {!showRewardChoice && !showAttackSelection && !showJokerShop && (
                                            <div style={{margin: '20px 0', padding: '15px', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '10px'}}>
                                                <p style={{color: '#0f0', fontWeight: 'bold'}}>✅ RICHTIG GERATEN!</p>
                                                <p style={{color: '#aaa', fontSize: '0.9rem'}}>Entscheidung getroffen. Warte auf andere Spieler...</p>
                                            </div>
                                        )}
                                    </div>
                                )
                            } else {
                                return (
                                    <div style={{margin: '20px 0', padding: '15px', background: 'rgba(0, 255, 0, 0.1)', borderRadius: '10px'}}>
                                        <p style={{color: '#0f0', fontWeight: 'bold'}}>✅ RICHTIG GERATEN!</p>
                                        <p style={{color: '#aaa', fontSize: '0.9rem'}}>Entscheidung getroffen. Warte auf andere Spieler...</p>
                                    </div>
                                )
                            }
                        } else if (myVote && truth !== undefined && truth !== null && String(myVote.choice) !== String(truth)) {
                            // Falsch geraten - WICHTIG: String-Vergleich, aber nur wenn truth existiert
                            console.log('❌ [RESULT UI] Falsch geraten erkannt:', {
                                myChoice: myVote.choice,
                                truth: truth,
                                isPartyMode: isPartyMode,
                                localActionDone: localActionDone
                            })
                            if (isPartyMode && !localActionDone) {
                                handlePartyModeWrongAnswer()
                                setLocalActionDone(true)
                            }
                            return (
                                <div style={{
                                    margin: '20px 0',
                                    padding: '20px',
                                    background: 'rgba(139, 0, 0, 0.3)',
                                    borderRadius: '15px',
                                    border: '2px solid rgba(255, 0, 0, 0.5)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{fontSize: '3rem', marginBottom: '10px'}}>❌</div>
                                    <p style={{color: '#ff0000', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '10px'}}>FALSCH GERATEN</p>
                                    {isPartyMode && <p style={{color: '#fff', fontSize: '0.9rem'}}>Du erhältst 10°C Strafhitze.</p>}
                                </div>
                            )
                        } else {
                            return (
                                <div style={{margin: '20px 0', padding: '15px', background: 'rgba(22, 27, 34, 0.6)', borderRadius: '10px'}}>
                                    <p style={{color: '#ccc'}}>⌛ Keine Antwort abgegeben.</p>
                                </div>
                            )
                        }
                    })()}
                    
                    <div style={{margin: '20px 0'}}>
                        <div style={{marginBottom: '10px', color: '#aaa', fontSize: '0.9rem'}}>
                            Bereit: {(globalData.ready || []).length}/{renderPlayers().length}
                        </div>
                    </div>
                    {/* WICHTIG: Button immer anzeigen, außer Spieler ist ausgeschieden */}
                    {(() => {
                        const playerData = globalData.players?.[myName]
                        const maxTemp = globalData.config?.maxTemp || 100
                        const isEliminated = (playerData?.temp || 0) >= maxTemp
                        
                        // Button anzeigen wenn: localActionDone ODER Hotseat (Hotseat hat automatisch localActionDone)
                        const shouldShowButton = localActionDone || isHotseat || isEliminated
                        
                        if (!shouldShowButton) return null
                        
                        return (
                            <button 
                                className={(globalData.ready || []).includes(myName) ? 'btn-secondary' : 'btn-primary'} 
                                onClick={setReady}
                                disabled={isEliminated}
                                style={{marginTop: '20px'}}
                            >
                                {isEliminated ? '🔥 Hitzkopf - Ausgeschieden' : (globalData.ready || []).includes(myName) ? '❌ Nicht bereit' : '👍 Bereit'}
                            </button>
                        )
                    })()}
                </div>
                )
            })()}
            
            {/* WINNER SCREEN */}
            {currentScreen === 'winner' && globalData && (
                <div className="screen active card">
                    <h2>🎉 Gewinner!</h2>
                    {(() => {
                        const maxTemp = globalData.config?.maxTemp || 100
                        const winner = Object.entries(globalData.players || {}).find(([name, data]) => (data.temp || 0) < maxTemp)
                        if (winner) {
                            const [winnerName, winnerData] = winner
                            return (
                                <div style={{margin: '20px 0', padding: '20px', background: 'rgba(22, 27, 34, 0.6)', borderRadius: '15px', textAlign: 'center'}}>
                                    <div style={{fontSize: '4rem', marginBottom: '15px'}}>{winnerData.emoji || '😎'}</div>
                                    <p style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#ff8c00', marginBottom: '10px'}}>
                                        {winnerName}
                                    </p>
                                    <p style={{color: '#aaa', fontSize: '1rem'}}>
                                        ist cool geblieben und gewinnt diese Runde Hitzkopf! 🧊
                                    </p>
                                    <p style={{color: '#888', fontSize: '0.9rem', marginTop: '10px'}}>
                                        {winnerData.temp || 0}°C
                                    </p>
                                </div>
                            )
                        }
                        return null
                    })()}
                    <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                        {isHost && (
                            <button onClick={rematchGame} className="btn-primary" style={{flex: 1}}>
                                ♻️ Revanche starten
                            </button>
                        )}
                        <button onClick={leaveLobby} className="btn-secondary" style={{flex: 1}}>
                            🚪 Lobby verlassen
                        </button>
                    </div>
                </div>
            )}
            
            {/* COUNTDOWN OVERLAY */}
            {showCountdown && countdownText && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.9)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        zIndex: 5000,
                        animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <div style={{
                        fontSize: 'clamp(4rem, 20vw, 8rem)',
                        fontWeight: 900,
                        color: '#ff6b35',
                        textShadow: '0 0 40px rgba(255, 107, 53, 0.8), 0 0 80px rgba(255, 107, 53, 0.4)',
                        animation: 'pulse 1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                        letterSpacing: '-0.02em',
                        lineHeight: '1.2',
                        whiteSpace: 'pre-line',
                        textAlign: 'center'
                    }}>
                        {countdownText}
                    </div>
                    {countdownText !== 'HITZ\nKOPF!' && (
                        <div style={{
                            marginTop: '16px',
                            fontSize: 'clamp(1rem, 4vw, 1.5rem)',
                            color: '#fff',
                            letterSpacing: '0.3em',
                            fontWeight: 600,
                            opacity: 0.9
                        }}>
                            Bereit machen...
                        </div>
                    )}
                </div>
            )}
            
            {/* HOTSEAT MODAL */}
            {showHotseatModal && globalData && globalData.hotseat && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000
                    }}
                    onClick={closeHotseatModal}
                >
                    <div 
                        style={{
                            background: 'linear-gradient(145deg, #1e1e1e, #252525)',
                            padding: '40px',
                            borderRadius: '20px',
                            maxWidth: '500px',
                            margin: '20px',
                            border: '2px solid #ff4500',
                            boxShadow: '0 8px 32px rgba(255, 69, 0, 0.6)',
                            textAlign: 'center',
                            position: 'relative',
                            zIndex: 10001
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{fontSize: '5rem', marginBottom: '20px'}}>🎯</div>
                        {myName === globalData.hotseat ? (
                            <>
                                <div style={{
                                    fontSize: '2.5rem',
                                    fontWeight: '800',
                                    background: 'linear-gradient(90deg, #ff4500, #ff8c00)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    textShadow: '0 0 18px rgba(255, 69, 0, 0.6)',
                                    marginBottom: '15px'
                                }}>
                                    Du bist gefragt!
                                </div>
                                <div style={{fontSize: '1.2rem', color: '#fff', marginBottom: '25px'}}>
                                    Alle anderen müssen deine Antwort erraten.
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    fontSize: '2.5rem',
                                    fontWeight: '800',
                                    background: 'linear-gradient(90deg, #ff4500, #ff8c00)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    textShadow: '0 0 18px rgba(255, 69, 0, 0.6)',
                                    marginBottom: '15px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px'
                                }}>
                                    <span>{globalData.players?.[globalData.hotseat]?.emoji || '😊'}</span>
                                    <span>{globalData.hotseat}</span>
                                </div>
                                <div style={{fontSize: '1.2rem', color: '#fff', marginBottom: '25px'}}>
                                    ist gefragt. Versuche {globalData.hotseat}'s Antwort zu erraten.
                                </div>
                            </>
                        )}
                        <button 
                            className="btn-primary" 
                            onClick={closeHotseatModal}
                            style={{
                                padding: '15px 30px',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #ff4500, #ff8c00)',
                                border: 'none',
                                borderRadius: '12px',
                                color: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(255, 69, 0, 0.4)',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.05)'
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 69, 0, 0.6)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)'
                                e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 69, 0, 0.4)'
                            }}
                        >
                            Los geht's
                        </button>
                    </div>
                </div>
            )}
            
            {/* ATTACK MODAL */}
            {showAttackModal && attackResult && globalData && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000
                    }}
                    onClick={closeAttackModal}
                >
                    <div 
                        style={{
                            background: 'linear-gradient(145deg, #1e1e1e, #252525)',
                            padding: '40px',
                            borderRadius: '20px',
                            maxWidth: '500px',
                            margin: '20px',
                            border: attackResult.totalDmg > 0 ? '2px solid #ff4500' : '2px solid #4a9eff',
                            boxShadow: attackResult.totalDmg > 0 ? '0 8px 32px rgba(255, 69, 0, 0.8)' : '0 8px 32px rgba(74, 158, 255, 0.8)',
                            textAlign: 'center',
                            position: 'relative',
                            zIndex: 10001
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{fontSize: '5rem', marginBottom: '20px'}}>
                            {attackResult.totalDmg > 0 ? '🔥' : '🧊'}
                        </div>
                        <div style={{
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            color: attackResult.totalDmg > 0 ? '#ff4500' : '#4a9eff',
                            marginBottom: '15px',
                            textShadow: attackResult.totalDmg > 0 ? '0 0 18px rgba(255, 69, 0, 0.6)' : '0 0 18px rgba(74, 158, 255, 0.6)'
                        }}>
                            {myName}
                        </div>
                        <div style={{fontSize: '1.2rem', color: '#fff', marginBottom: '15px'}}>
                            {attackResult.totalDmg > 0 
                                ? `Du wurdest aufgeheizt! Insgesamt ${attackResult.totalDmg}°C`
                                : 'Cool geblieben - Keiner hat dich aufgeheizt'
                            }
                        </div>
                        {attackResult.totalDmg === 0 && (
                            <div style={{fontSize: '0.9rem', color: '#aaa', marginBottom: '25px'}}>
                                Du hast diese Runde keine Hitze erhalten
                            </div>
                        )}
                        {attackResult.attackDetails && attackResult.attackDetails.length > 0 && attackResult.totalDmg > 0 && (
                            <div style={{
                                fontSize: '0.9rem',
                                color: '#aaa',
                                marginBottom: '25px',
                                textAlign: 'left',
                                maxWidth: '80%',
                                marginLeft: 'auto',
                                marginRight: 'auto',
                                paddingTop: '15px',
                                borderTop: '1px solid #333'
                            }}>
                                <strong style={{color: '#fff'}}>Angriffe:</strong><br />
                                {attackResult.attackDetails
                                    .filter(d => !d.isPenalty && !d.mirrored)
                                    .map((detail, idx) => (
                                        <div key={idx} style={{marginTop: '8px', color: '#ccc'}}>
                                            • {detail.attacker}: +{detail.dmg}°C
                                        </div>
                                    ))}
                            </div>
                        )}
                        <div style={{
                            width: '100%',
                            height: '20px',
                            background: '#333',
                            borderRadius: '10px',
                            marginBottom: '10px',
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            {(() => {
                                const maxTemp = globalData.config?.maxTemp || 100
                                const currentTemp = globalData.players?.[myName]?.temp || 0
                                const tempPercent = Math.min((currentTemp / maxTemp) * 100, 100)
                                
                                return (
                                    <div 
                                        style={{
                                            height: '100%',
                                            width: '0%',
                                            background: attackResult.totalDmg > 0 
                                                ? 'linear-gradient(90deg, #ffae00, #ff0000)' 
                                                : 'linear-gradient(90deg, #4a9eff, #0066cc)',
                                            transition: 'width 1.2s ease-out',
                                            boxShadow: attackResult.totalDmg > 0 ? '0 0 20px rgba(255, 0, 0, 0.7)' : 'none'
                                        }}
                                        ref={(el) => {
                                            if (el) {
                                                setTimeout(() => {
                                                    el.style.width = `${tempPercent}%`
                                                }, 100)
                                            }
                                        }}
                                    ></div>
                                )
                            })()}
                        </div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: attackResult.totalDmg > 0 ? '#ff4500' : '#4a9eff',
                            marginTop: '10px'
                        }}>
                            {globalData.players?.[myName]?.temp || 0}°C
                        </div>
                        <button 
                            className="btn-primary" 
                            onClick={closeAttackModal}
                            style={{
                                marginTop: '25px',
                                padding: '15px 30px',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #ff4500, #ff8c00)',
                                border: 'none',
                                borderRadius: '12px',
                                color: '#fff',
                                cursor: 'pointer',
                                width: '100%'
                            }}
                        >
                            Verstanden
                        </button>
                    </div>
                </div>
            )}
            
            {/* RULES MODAL */}
            {showRulesModal && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000
                    }}
                    onClick={() => setShowRulesModal(false)}
                >
                    <div 
                        style={{
                            background: 'linear-gradient(145deg, #1e1e1e, #252525)',
                            padding: '40px',
                            borderRadius: '20px',
                            maxWidth: '600px',
                            margin: '20px',
                            border: '2px solid #ff4500',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            position: 'relative',
                            zIndex: 10001
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{
                            color: '#ff4500',
                            marginBottom: '30px',
                            fontSize: '1.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <span style={{fontSize: '1.5rem'}}>📖</span>
                            <span>Anleitung</span>
                        </h2>
                        <div style={{color: '#fff', lineHeight: '1.8', textAlign: 'left'}}>
                            <div style={{
                                marginBottom: '25px',
                                padding: '15px',
                                background: 'rgba(22, 27, 34, 0.6)',
                                borderRadius: '10px'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
                                    <span style={{fontSize: '1.5rem'}}>🎯</span>
                                    <strong style={{color: '#ff8c00', fontSize: '1.1rem'}}>Ziel:</strong>
                                </div>
                                <p style={{color: '#ccc', marginLeft: '35px'}}>
                                    Errate die Antworten deiner Freunde und bringe sie zum kochen!
                                </p>
                            </div>
                            
                            <div style={{
                                marginBottom: '25px',
                                padding: '15px',
                                background: 'rgba(22, 27, 34, 0.6)',
                                borderRadius: '10px'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
                                    <span style={{fontSize: '1.5rem'}}>🔥</span>
                                    <strong style={{color: '#ff8c00', fontSize: '1.1rem'}}>Verlierer:</strong>
                                </div>
                                <p style={{color: '#ccc', marginLeft: '35px'}}>
                                    Wer als erstes 100° erreicht, fliegt raus.
                                </p>
                            </div>
                            
                            <div style={{
                                marginBottom: '25px',
                                padding: '15px',
                                background: 'rgba(22, 27, 34, 0.6)',
                                borderRadius: '10px'
                            }}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
                                    <span style={{fontSize: '1.5rem'}}>🧊</span>
                                    <strong style={{color: '#ff8c00', fontSize: '1.1rem'}}>Gewinner:</strong>
                                </div>
                                <p style={{color: '#ccc', marginLeft: '35px'}}>
                                    Bewahrst du einen kühlen Kopf, entscheidest du das Spiel für dich.
                                </p>
                            </div>
                        </div>
                        <button 
                            className="btn-primary" 
                            onClick={() => setShowRulesModal(false)}
                            style={{
                                marginTop: '25px',
                                padding: '15px 30px',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #ff4500, #ff8c00)',
                                border: 'none',
                                borderRadius: '12px',
                                color: '#fff',
                                cursor: 'pointer',
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            <span>Verstanden</span>
                            <span>✓</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
  )
}

export default App
