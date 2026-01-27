// Fragekategorien - ausgelagert für besseres Code-Splitting
// Diese Datei kann lazy-loaded werden, wenn nicht sofort benötigt

export const questionCategories = {
    "astronomie_geographie": {
        name: "Astronomie & Geographie",
        emoji: "🌍",
        questions: [
            { id: "ag_1", q: "Lieber am Tag oder in der Nacht aktiv sein?", a: "Tag ☀️", b: "Nacht 🌙" },
            { id: "ag_2", q: "Lieber im Regenwald oder in der Wüste stranden?", a: "Regenwald 🌳", b: "Wüste 🏜️" },
            { id: "ag_3", q: "Lieber den Ozean oder riesige Gebirge bestaunen?", a: "Ozean 🌊", b: "Gebirge ⛰️" },
            { id: "ag_4", q: "Lieber ewiges Eis oder ewige Hitze ertragen?", a: "Eis ❄️", b: "Hitze 🌵" },
            { id: "ag_5", q: "Lieber eine Städtereise oder einen Natururlaub machen?", a: "Stadt 🏙️", b: "Natur 🏞️" },
            { id: "ag_6", q: "Lieber auf einer Insel oder auf dem Festland leben?", a: "Insel 🏝️", b: "Festland 🗺️" },
            { id: "ag_7", q: "Lieber ein Gewitter oder Sonnenschein beobachten?", a: "Gewitter ⛈️", b: "Sonne ☀️" },
            { id: "ag_8", q: "Lieber Schnee zu Weihnachten oder 30 Grad am Strand?", a: "Schnee ❄️", b: "30 Grad 🌡️" },
            { id: "ag_9", q: "Lieber zum Mond fliegen oder die Tiefsee erforschen?", a: "Mond 🚀", b: "Tiefsee 🐙" },
            { id: "ag_10", q: "Lieber im Flachland oder in den Bergen wohnen?", a: "Flachland 🌾", b: "Berge 🏔️" },
            { id: "ag_11", q: "Lieber im Fluss oder im See schwimmen?", a: "Fluss 🌊", b: "See 🏞️" },
            { id: "ag_12", q: "Lieber durch den Dschungel oder durch den Nadelwald spazieren?", a: "Dschungel 🌴", b: "Nadelwald 🌲" },
            { id: "ag_13", q: "Lieber einen Vulkan oder einen Geysir sehen?", a: "Vulkan 🌋", b: "Geysir 💨" },
            { id: "ag_14", q: "Lieber Polarlichter oder eine Sonnenfinsternis sehen?", a: "Polarlicht 🌌", b: "Sonnenfinsternis 🌑" },
            { id: "ag_15", q: "Lieber den Mars besiedeln oder die Erde retten?", a: "Mars 🔴", b: "Erde 🌍" },
            { id: "ag_16", q: "Lieber Urlaub im Camper oder auf dem Kreuzfahrtschiff machen?", a: "Camper 🚐", b: "Schiff 🚢" },
            { id: "ag_17", q: "Lieber dünne Höhenluft oder salzige Meeresbrise atmen?", a: "Berge ⛰️", b: "Meer 🌊" },
            { id: "ag_18", q: "Lieber fliegen können oder die Zeit anhalten?", a: "Fliegen 🕊️", b: "Zeitstopp ⏸️" }
        ]
    },
    "essen_trinken": {
        name: "Essen & Trinken",
        emoji: "🍽️",
        questions: [
            { id: "et_1", q: "Lieber Nutella mit oder ohne Butter essen?", a: "Mit Butter 🧈", b: "Ohne Butter 🍞" },
            { id: "et_2", q: "Lieber Kaffee oder Tee am Morgen trinken?", a: "Kaffee ☕", b: "Tee 🍵" },
            { id: "et_3", q: "Lieber nie wieder Pizza oder nie wieder Pasta essen?", a: "Keine Pizza 🍕", b: "Keine Pasta 🍝" },
            { id: "et_4", q: "Lieber Schokolade oder Gummibärchen naschen?", a: "Schokolade 🍫", b: "Gummibärchen 🐻" },
            { id: "et_5", q: "Lieber einen Burger oder einen Döner essen?", a: "Burger 🍔", b: "Döner 🥙" },
            { id: "et_6", q: "Lieber selbst kochen oder Essen bestellen?", a: "Kochen 🧑‍🍳", b: "Bestellen 🛵" },
            { id: "et_7", q: "Lieber Vanille- oder Schokoeis essen?", a: "Vanille 🍦", b: "Schoko 🍫" },
            { id: "et_8", q: "Lieber süßes oder salziges Popcorn essen?", a: "Süß 🍬", b: "Salzig 🧂" },
            { id: "et_9", q: "Lieber Wein oder Bier am Abend trinken?", a: "Wein 🍷", b: "Bier 🍺" },
            { id: "et_10", q: "Lieber Käsebrot oder Wurstbrot essen?", a: "Käse 🧀", b: "Wurst 🥓" },
            { id: "et_11", q: "Lieber frühstücken oder zu Abend essen?", a: "Frühstück 🥐", b: "Abendessen 🍝" },
            { id: "et_12", q: "Lieber Cola oder Saft trinken?", a: "Cola 🥤", b: "Saft 🧃" },
            { id: "et_13", q: "Lieber Sahnetorte oder trockenen Kuchen essen?", a: "Torte 🎂", b: "Kuchen 🍰" },
            { id: "et_14", q: "Lieber Pommes mit Ketchup oder Mayo essen?", a: "Ketchup 🍅", b: "Mayo 🥚" },
            { id: "et_15", q: "Lieber eine Vorspeise oder ein Dessert bestellen?", a: "Vorspeise 🥗", b: "Dessert 🍨" },
            { id: "et_16", q: "Lieber stilles Wasser oder Wasser mit Sprudel trinken?", a: "Still 💧", b: "Sprudel 🫧" },
            { id: "et_17", q: "Lieber Kartoffeln oder Reis als Beilage?", a: "Kartoffeln 🥔", b: "Reis 🍚" },
            { id: "et_18", q: "Lieber süß oder herzhaft frühstücken?", a: "Süß 🥞", b: "Herzhaft 🥓" },
            { id: "et_19", q: "Lieber scharf oder mild essen?", a: "Scharf 🌶️", b: "Mild 🥛" },
            { id: "et_20", q: "Lieber Pizza Hawaii oder Pizza Salami essen?", a: "Hawaii 🍍", b: "Salami 🍕" }
        ]
    },
    "flora_fauna": {
        name: "Flora & Fauna",
        emoji: "🌿",
        questions: [
            { id: "ff_1", q: "Lieber einen Hund oder eine Katze haben?", a: "Hund 🐕", b: "Katze 🐈" },
            { id: "ff_2", q: "Lieber Topfpflanzen oder Schnittblumen kaufen?", a: "Topf 🪴", b: "Strauß 💐" },
            { id: "ff_3", q: "Lieber Vögel oder Fische beobachten?", a: "Vögel 🐦", b: "Fische 🐠" },
            { id: "ff_4", q: "Lieber Kakteen oder Orchideen pflegen?", a: "Kaktus 🌵", b: "Orchidee 🌸" },
            { id: "ff_5", q: "Lieber ein Pferd oder einen Delfin besitzen?", a: "Pferd 🐎", b: "Delfin 🐬" },
            { id: "ff_6", q: "Lieber im Garten oder im Wald sein?", a: "Garten 🏡", b: "Wald 🌳" },
            { id: "ff_7", q: "Lieber die Spinne fangen oder wegrennen?", a: "Fangen 🕸️", b: "Wegrennen 🏃" },
            { id: "ff_8", q: "Lieber einen Dino oder einen Drachen zähmen?", a: "Dino 🦖", b: "Drache 🐉" },
            { id: "ff_9", q: "Lieber Nadelbäume oder Laubbäume im Garten?", a: "Nadel 🌲", b: "Laub 🍃" },
            { id: "ff_10", q: "Lieber Säugetiere oder Reptilien?", a: "Säuger 🐾", b: "Reptil 🦎" },
            { id: "ff_11", q: "Lieber Obst oder Gemüse anbauen?", a: "Obst 🍎", b: "Gemüse 🥕" },
            { id: "ff_12", q: "Lieber mit Haien schwimmen oder Löwen begegnen?", a: "Hai 🦈", b: "Löwe 🦁" },
            { id: "ff_13", q: "Lieber Wespen oder Mücken ertragen?", a: "Wespe 🐝", b: "Mücke 🦟" },
            { id: "ff_14", q: "Lieber Elefanten oder Wale sehen?", a: "Elefant 🐘", b: "Wal 🐋" },
            { id: "ff_15", q: "Lieber duftende oder bunte Blumen?", a: "Duft 👃", b: "Farbe 🎨" },
            { id: "ff_16", q: "Lieber einem Wolf oder einem Bären begegnen?", a: "Wolf 🐺", b: "Bär 🐻" },
            { id: "ff_17", q: "Lieber in den Zoo oder in einen Wildpark gehen?", a: "Zoo 🏙️", b: "Wildpark 🌲" },
            { id: "ff_18", q: "Lieber Insekten essen oder hungern müssen?", a: "Insekten 🦗", b: "Hungern 🍽️" }
        ]
    },
    "forschung_wissenschaft": {
        name: "Forschung & Wissenschaft",
        emoji: "🔬",
        questions: [
            { id: "fw_1", q: "Lieber Biologie- oder Physikunterricht?", a: "Bio 🧬", b: "Physik ⚛️" },
            { id: "fw_2", q: "Lieber im Labor oder draußen im Feld arbeiten?", a: "Labor 🧪", b: "Draußen 🌍" },
            { id: "fw_3", q: "Lieber die Weltformel finden oder unsterblich sein?", a: "Formel 📜", b: "Unsterblich ⚗️" },
            { id: "fw_4", q: "Lieber durch ein Mikroskop oder ein Teleskop schauen?", a: "Mikroskop 🔬", b: "Teleskop 🔭" },
            { id: "fw_5", q: "Lieber Chemie oder Mathe verstehen?", a: "Chemie ⚗️", b: "Mathe 📐" },
            { id: "fw_6", q: "Lieber in die Zukunft oder Vergangenheit reisen?", a: "Zukunft 🚀", b: "Vergangenheit 🦕" },
            { id: "fw_7", q: "Lieber Aliens oder eine Super-KI entdecken?", a: "Aliens 👽", b: "KI 🤖" },
            { id: "fw_8", q: "Lieber wissen WANN oder WIE du stirbst?", a: "Wann ⏳", b: "Wie 💀" },
            { id: "fw_9", q: "Lieber die Tiefsee oder das Weltall erforschen?", a: "Tiefsee 🌊", b: "Weltall 🌌" },
            { id: "fw_10", q: "Lieber Elon Musk oder Albert Einstein treffen?", a: "Musk 🚀", b: "Einstein 💡" },
            { id: "fw_11", q: "Lieber Genetik oder Informatik studieren?", a: "Genetik 🧬", b: "Informatik 💻" },
            { id: "fw_12", q: "Lieber auf Fakten oder auf Intuition vertrauen?", a: "Fakten 📊", b: "Bauchgefühl 🧠" },
            { id: "fw_13", q: "Lieber einen Roboter oder einen Klon haben?", a: "Roboter 🤖", b: "Klon 🐑" },
            { id: "fw_14", q: "Lieber ein Entdecker oder ein Erfinder sein?", a: "Entdecker 🔍", b: "Erfinder 💡" },
            { id: "fw_15", q: "Lieber den Nobelpreis oder ein Patent erhalten?", a: "Nobelpreis 🥇", b: "Patent 💰" }
        ]
    },
    "geschichte_politik": {
        name: "Geschichte & Politik",
        emoji: "🏛️",
        questions: [
            { id: "gp_1", q: "Lieber in der Antike oder Zukunft leben?", a: "Antike 🏛️", b: "Zukunft 🏙️" },
            { id: "gp_2", q: "Lieber König oder gewählter Präsident sein?", a: "König 👑", b: "Präsident 🗳️" },
            { id: "gp_3", q: "Lieber ein Ritter oder ein Pirat sein?", a: "Ritter ⚔️", b: "Pirat 🏴‍☠️" },
            { id: "gp_4", q: "Lieber Revolutionär oder Stratege sein?", a: "Revolutionär 🚩", b: "Stratege ♟️" },
            { id: "gp_5", q: "Lieber im Mittelalter oder in einem Sci-Fi Szenario leben?", a: "Mittelalter 🛡️", b: "Sci-Fi 👽" },
            { id: "gp_6", q: "Lieber in einer Demokratie oder Monarchie leben?", a: "Demokratie 🗳️", b: "Monarchie 👑" },
            { id: "gp_7", q: "Lieber reformieren oder eine Revolution starten?", a: "Reform ✏️", b: "Revolution 🔥" },
            { id: "gp_8", q: "Lieber in einem Imperium oder Stadtstaat leben?", a: "Imperium 🌍", b: "Stadtstaat 🏛️" },
            { id: "gp_9", q: "Lieber echte Dinos oder den Pyramidenbau sehen?", a: "Dinos 🦖", b: "Pyramiden 🏗️" },
            { id: "gp_10", q: "Lieber Wirtschaft oder Umwelt priorisieren?", a: "Wirtschaft 💼", b: "Umwelt 🌳" },
            { id: "gp_11", q: "Lieber global oder national denken?", a: "Global 🌐", b: "National 🇩🇪" },
            { id: "gp_12", q: "Lieber Tradition oder Fortschritt bewahren?", a: "Tradition 📜", b: "Fortschritt 🚀" },
            { id: "gp_13", q: "Lieber Napoleon oder Caesar interviewen?", a: "Napoleon 🇫🇷", b: "Caesar 🇮🇹" },
            { id: "gp_14", q: "Lieber auf Innenpolitik oder Außenpolitik konzentrieren?", a: "Innen 🏠", b: "Außen 🌍" },
            { id: "gp_15", q: "Lieber Wahlpflicht oder Wahlrecht haben?", a: "Pflicht ❗️", b: "Recht 🗳️" },
            { id: "gp_16", q: "Lieber 100 Jahre in die Vergangenheit oder Zukunft reisen?", a: "Vergangenheit 🔙", b: "Zukunft 🔜" }
        ]
    },
    "medien_unterhaltung": {
        name: "Medien & Unterhaltung",
        emoji: "📺",
        questions: [
            { id: "mu_1", q: "Lieber einen Film oder eine Serie schauen?", a: "Film 🎬", b: "Serie 📺" },
            { id: "mu_2", q: "Lieber Netflix oder YouTube nutzen?", a: "Netflix 🟥", b: "YouTube ▶️" },
            { id: "mu_3", q: "Lieber ins Kino gehen oder auf der Couch bleiben?", a: "Kino 🍿", b: "Couch 🛋️" },
            { id: "mu_4", q: "Lieber Marvel oder DC schauen?", a: "Marvel 🛡️", b: "DC 🦇" },
            { id: "mu_5", q: "Lieber Comedy oder Horror schauen?", a: "Comedy 😂", b: "Horror 😱" },
            { id: "mu_6", q: "Lieber Star Wars oder Star Trek Fan sein?", a: "Star Wars ⚔️", b: "Star Trek 🖖" },
            { id: "mu_7", q: "Lieber eine Doku oder einen Actionfilm sehen?", a: "Doku 🧠", b: "Action 💥" },
            { id: "mu_8", q: "Lieber im Originalton oder mit Synchro schauen?", a: "Original 🇬🇧", b: "Synchro 🇩🇪" },
            { id: "mu_9", q: "Lieber Harry Potter oder Herr der Ringe schauen?", a: "Potter ⚡", b: "HdR 💍" },
            { id: "mu_10", q: "Lieber Spotify oder Radio hören?", a: "Spotify 🎧", b: "Radio 📻" },
            { id: "mu_11", q: "Lieber das Buch lesen oder den Film schauen?", a: "Buch 📖", b: "Film 🎥" },
            { id: "mu_12", q: "Lieber der Bösewicht oder der Held sein?", a: "Bösewicht 😈", b: "Held 😇" },
            { id: "mu_13", q: "Lieber Game of Thrones Anfang oder Ende?", a: "Anfang 🏰", b: "Ende 🔥" },
            { id: "mu_14", q: "Lieber Spoiler wissen oder überrascht werden?", a: "Spoiler 🙈", b: "Überraschung 🎁" },
            { id: "mu_15", q: "Lieber Trash-TV oder Arte schauen?", a: "Trash 🗑️", b: "Arte 🎨" },
            { id: "mu_16", q: "Lieber E-Books oder Papierbücher lesen?", a: "E-Book 📱", b: "Papier 📖" }
        ]
    },
    "musik": {
        name: "Musik",
        emoji: "🎵",
        questions: [
            { id: "mk_1", q: "Lieber Rock oder Hip-Hop hören?", a: "Rock 🎸", b: "Hip-Hop 🎤" },
            { id: "mk_2", q: "Lieber zu Techno oder Schlager feiern?", a: "Techno 🔊", b: "Schlager 🎉" },
            { id: "mk_3", q: "Lieber Musik mit Gesang oder Instrumental hören?", a: "Gesang 🗣️", b: "Instrumental 🎻" },
            { id: "mk_4", q: "Lieber auf ein Festival oder ein Konzert gehen?", a: "Festival ⛺", b: "Konzert 🎫" },
            { id: "mk_5", q: "Lieber Sänger oder Gitarrist sein?", a: "Sänger 🎤", b: "Gitarrist 🎸" },
            { id: "mk_6", q: "Lieber 80er oder 2000er Musik hören?", a: "80er 🕺", b: "2000er 💿" },
            { id: "mk_7", q: "Lieber Gitarre oder Klavier spielen können?", a: "Gitarre 🎸", b: "Klavier 🎹" },
            { id: "mk_8", q: "Lieber Boybands oder Solo-Künstler hören?", a: "Boyband 👯‍♂️", b: "Solo 👤" },
            { id: "mk_9", q: "Lieber In-Ear oder Over-Ear Kopfhörer tragen?", a: "In-Ear 👂", b: "Over-Ear 🎧" },
            { id: "mk_10", q: "Lieber Vinyl oder Streaming nutzen?", a: "Vinyl 💿", b: "Streaming 📱" },
            { id: "mk_11", q: "Lieber traurige oder fröhliche Musik hören?", a: "Traurig 😢", b: "Fröhlich 🙂" },
            { id: "mk_12", q: "Lieber Jazz oder Metal hören?", a: "Jazz 🎷", b: "Metal 🤘" },
            { id: "mk_13", q: "Lieber im Club tanzen oder trinken?", a: "Tanzen 💃", b: "Trinken 🍹" },
            { id: "mk_14", q: "Lieber nur noch eine Band hören oder gar keine Musik mehr?", a: "Eine Band 🔂", b: "Keine Musik 🔇" },
            { id: "mk_15", q: "Lieber Musik selber machen oder nur hören?", a: "Machen 🎵", b: "Hören 👂" }
        ]
    },
    "sport": {
        name: "Sport",
        emoji: "⚽",
        questions: [
            { id: "sp_1", q: "Lieber Teamsport oder Einzelsport machen?", a: "Team 🤝", b: "Einzel 👤" },
            { id: "sp_2", q: "Lieber Sport gucken oder selbst machen?", a: "Gucken 📺", b: "Machen 🏃" },
            { id: "sp_3", q: "Lieber morgens oder abends trainieren?", a: "Morgens 🌅", b: "Abends 🌙" },
            { id: "sp_4", q: "Lieber Cardio oder Krafttraining machen?", a: "Cardio 💓", b: "Kraft 💪" },
            { id: "sp_5", q: "Lieber Fußball oder Formel 1 schauen?", a: "Fußball ⚽", b: "Formel 1 🏎️" },
            { id: "sp_6", q: "Lieber Yoga oder Boxen machen?", a: "Yoga 🧘", b: "Boxen 🥊" },
            { id: "sp_7", q: "Lieber Olympia oder die WM gewinnen?", a: "Olympia 🏅", b: "WM 🏆" },
            { id: "sp_8", q: "Lieber siegen oder Spaß haben?", a: "Siegen 🥇", b: "Spaß 🤝" },
            { id: "sp_9", q: "Lieber Schwimmen oder Joggen gehen?", a: "Schwimmen 🏊", b: "Joggen 🏃" },
            { id: "sp_10", q: "Lieber Tennis oder Tischtennis spielen?", a: "Tennis 🎾", b: "Tischtennis 🏓" },
            { id: "sp_11", q: "Lieber Fahrrad oder E-Bike fahren?", a: "Rad 🚲", b: "E-Bike 🔋" },
            { id: "sp_12", q: "Lieber im Gym oder im Wald trainieren?", a: "Gym 🏋️", b: "Wald 🌲" },
            { id: "sp_13", q: "Lieber Fallschirm springen oder wandern gehen?", a: "Fallschirm 🪂", b: "Wandern 🥾" },
            { id: "sp_14", q: "Lieber Ski oder Snowboard fahren?", a: "Ski 🎿", b: "Snowboard 🏂" },
            { id: "sp_15", q: "Lieber Muskelkater haben oder faul sein?", a: "Muskelkater 😫", b: "Faul sein 🛋️" }
        ]
    },
    "technik_wirtschaft": {
        name: "Technik & Wirtschaft",
        emoji: "💻",
        questions: [
            { id: "tw_1", q: "Lieber Apple oder Android nutzen?", a: "Apple 🍎", b: "Android 🤖" },
            { id: "tw_2", q: "Lieber Windows oder Mac nutzen?", a: "Windows 🪟", b: "Mac 🍏" },
            { id: "tw_3", q: "Lieber bar oder mit Karte zahlen?", a: "Bar 💶", b: "Karte 💳" },
            { id: "tw_4", q: "Lieber Chef oder Angestellter sein?", a: "Chef 💼", b: "Angestellter 🛡️" },
            { id: "tw_5", q: "Lieber im Homeoffice oder im Büro arbeiten?", a: "Homeoffice 🏠", b: "Büro 🏢" },
            { id: "tw_6", q: "Lieber Sprachnachricht oder Text senden?", a: "Audio 🎙️", b: "Text ✍️" },
            { id: "tw_7", q: "Lieber Online oder im Laden einkaufen?", a: "Online 📦", b: "Laden 🛍️" },
            { id: "tw_8", q: "Lieber in Aktien oder ins Sparbuch investieren?", a: "Aktien 📈", b: "Sparbuch 💰" },
            { id: "tw_9", q: "Lieber auf Krypto oder Gold setzen?", a: "Krypto ₿", b: "Gold 🥇" },
            { id: "tw_10", q: "Lieber fliegen oder beamen können?", a: "Fliegen 🚗", b: "Beamen ✨" },
            { id: "tw_11", q: "Lieber Instagram oder TikTok nutzen?", a: "Insta 📸", b: "TikTok 🎵" },
            { id: "tw_12", q: "Lieber Elektro oder Verbrenner fahren?", a: "Elektro ⚡", b: "Verbrenner ⛽" },
            { id: "tw_13", q: "Lieber per Sprache oder mit Knöpfen steuern?", a: "Sprache 🗣️", b: "Knöpfe 🔘" },
            { id: "tw_14", q: "Lieber Karriere machen oder viel Freizeit haben?", a: "Karriere 🚀", b: "Freizeit 🏖️" },
            { id: "tw_15", q: "Lieber reich oder berühmt sein?", a: "Reich 🤑", b: "Berühmt ⭐" },
            { id: "tw_16", q: "Lieber leeres Postfach oder Chaos haben?", a: "Zero ✅", b: "Chaos 📩" }
        ]
    },
    "gaming": {
        name: "Gaming",
        emoji: "🎮",
        questions: [
            { id: "gm_1", q: "Lieber hohen Ping (Lag) oder Ruckeln (FPS) haben?", a: "Lag 📡", b: "Ruckeln 🐌" },
            { id: "gm_2", q: "Lieber Spielstand verlieren oder gebannt werden?", a: "Spielstand weg 🗑️", b: "Bann 🚫" },
            { id: "gm_3", q: "Lieber ein glücklicher Noob oder ein gestresster Pro sein?", a: "Noob 😆", b: "Pro 😤" },
            { id: "gm_4", q: "Lieber Open World oder lineare Story spielen?", a: "Open World 🗺️", b: "Story 🎬" },
            { id: "gm_5", q: "Lieber am PC oder an der Konsole zocken?", a: "PC 🖥️", b: "Konsole 🎮" },
            { id: "gm_6", q: "Lieber mit Controller oder Maus spielen?", a: "Controller 🎮", b: "Maus ⌨️" },
            { id: "gm_7", q: "Lieber Survival oder Creative Modus spielen?", a: "Survival ⚔️", b: "Creative 🧱" },
            { id: "gm_8", q: "Lieber gute Grafik oder gute Story haben?", a: "Grafik 👁️", b: "Story 📖" },
            { id: "gm_9", q: "Lieber toxisch gewinnen oder nett verlieren?", a: "Gewinnen 🤬", b: "Verlieren 😊" },
            { id: "gm_10", q: "Lieber Singleplayer oder Multiplayer spielen?", a: "Single 🐺", b: "Multi 👥" },
            { id: "gm_11", q: "Lieber kostenlos (mit Werbung) oder Vollpreis spielen?", a: "Kostenlos 💸", b: "Vollpreis 💳" },
            { id: "gm_12", q: "Lieber campen oder rushen?", a: "Campen ⛺", b: "Rushen 🏃" },
            { id: "gm_13", q: "Lieber 100x versuchen oder beim ersten Mal schaffen?", a: "Tryhard 💀", b: "First Try 🍀" },
            { id: "gm_14", q: "Lieber Healer oder Damage Dealer spielen?", a: "Healer 🚑", b: "Damage ⚔️" },
            { id: "gm_15", q: "Lieber Retro-Games oder moderne Spiele zocken?", a: "Retro 👾", b: "Modern 💣" }
        ]
    },
    "diverses": {
        name: "Diverses / Persönlichkeit",
        emoji: "🎲",
        questions: [
            { id: "div_1", q: "Lieber unsichtbar sein oder fliegen können?", a: "Unsichtbar 👻", b: "Fliegen 🦅" },
            { id: "div_2", q: "Lieber immer die Wahrheit sagen oder immer lügen müssen?", a: "Wahrheit 😇", b: "Lüge 🤥" },
            { id: "div_3", q: "Lieber früh aufstehen oder lange wach bleiben?", a: "Früh ☀️", b: "Spät 🦉" },
            { id: "div_4", q: "Lieber nie wieder Musik hören oder nie wieder Filme sehen?", a: "Keine Musik 🔇", b: "Keine Filme 📺" },
            { id: "div_5", q: "Lieber mehr Zeit oder mehr Geld haben?", a: "Zeit 👴", b: "Geld 💶" },
            { id: "div_6", q: "Lieber mit Socken oder barfuß schlafen?", a: "An 🧦", b: "Aus 🦶" },
            { id: "div_7", q: "Lieber in die Vergangenheit oder Zukunft reisen?", a: "Vergangenheit ⏪", b: "Zukunft 👀" },
            { id: "div_8", q: "Lieber chaotisch oder ordentlich sein?", a: "Chaos 🌪️", b: "Ordnung 🗂️" },
            { id: "div_9", q: "Lieber Gedanken lesen oder mit Tieren sprechen können?", a: "Gedanken 🧠", b: "Tiere 🐾" },
            { id: "div_10", q: "Lieber Tattoos oder Piercings haben?", a: "Tattoo ✒️", b: "Piercing 💍" },
            { id: "div_11", q: "Lieber weich oder hart liegen?", a: "Weich ☁️", b: "Hart 🧱" },
            { id: "div_12", q: "Lieber auf das Handy oder das Auto verzichten?", a: "Kein Handy 📵", b: "Kein Auto 🚶" },
            { id: "div_13", q: "Lieber morgens oder abends duschen?", a: "Morgens 🚿", b: "Abends 🛁" },
            { id: "div_14", q: "Lieber im Lotto gewinnen oder den Traumjob finden?", a: "Lotto 🎰", b: "Traumjob 💼" },
            { id: "div_15", q: "Lieber offene Hose oder Zahnlücke haben?", a: "Hose offen 👖", b: "Zahnlücke 🦷" },
            { id: "div_16", q: "Lieber an Geister oder an Aliens glauben?", a: "Geister 👻", b: "Aliens 👽" }
        ]
    },
    "brettspiel": {
        name: "Brettspiel",
        emoji: "🎲",
        questions: [
            { id: "bs_1", q: "Wenn ich ein Parfüm kreieren müsste, wonach würde es am ehesten riechen?", a: "Frisch gemähter Rasen & Benzin", b: "Warme Pizza & Knoblauch", c: "Verbranntes Toast & Verzweiflung", d: "Neues Auto & alter Dachboden" },
            { id: "bs_2", q: "Was wäre am ehesten meine erste Amtshandlung, wenn ich für einen Tag Gott wäre?", a: "Mücken ausrotten (ersatzlos!)", b: "Festlegen, dass Pizza gesund ist und Brokkoli dick macht", c: "Jedem Menschen ein Einhorn schenken", d: "Montags das Aufstehen verbieten" },
            { id: "bs_3", q: "Wie würde ich am ehesten versuchen, ein Alien von der Menschheit zu überzeugen?", a: "Ich zeige ihnen süße Katzenvideos", b: "Ich lade sie auf einen Döner ein", c: "Ich zeige ihnen Memes über das Ende der Welt", d: "Wir sind verloren – ich helfe ihnen beim Zerstören" },
            { id: "bs_4", q: "Was ist am ehesten mein unnötigstes Talent?", a: "Mit der Zunge die Nasenspitze berühren", b: "Extrem laut mit den Fingern schnippen", c: "Die Namen aller Pokémon auswendig wissen", d: "So tun, als würde ich eine unsichtbare Treppe runtergehen" },
            { id: "bs_5", q: "In welcher Reality-Show würde ich am ehesten landen?", a: "Shopping Queen (wegen meines fragwürdigen Stils)", b: "Das Sommerhaus der Stars (Drama ist mein Vorname)", c: "Bares für Rares (um meinen alten Schrott zu verkaufen)", d: "Naked Survival (und ich würde nach 5 Minuten weinen)" },
            { id: "bs_6", q: "Wie würde mein eigener Freizeitpark am ehesten heißen?", a: "Nickerchen-Land (überall stehen Sofas)", b: "Chaos-Canyon (nichts funktioniert, aber es macht Spaß)", c: "Frittier-Paradies (alles ist aus Teig)", d: "Prokrastinations-World (Eröffnung ist auf morgen verschoben)" },
            { id: "bs_7", q: "Was ist am ehesten der Song, bei dem ich sofort die Party verlasse?", a: "Atemlos durch die Nacht (Helene Fischer)", b: "Last Christmas (im Oktober)", c: "Baby Shark in Dauerschleife", d: "Den Ententanz" },
            { id: "bs_8", q: "Welches Objekt würde ich am ehesten bei einer Zombie-Apokalypse als Waffe wählen?", a: "Eine elektrische Zahnbürste", b: "Eine gefrorene Salami", c: "Den Selfie-Stick (für den letzten Post)", d: "Eine Pfanne (der Klassiker)" },
            { id: "bs_9", q: "Was ist am ehesten die merkwürdigste Sache, die ich je gegessen habe?", a: "Eine Mutprobe aus dem Garten (Regenwurm & Co.)", b: "Etwas, das 3 Monate über dem MHD war", c: "Eine Kombination wie Nutella mit Salami", d: "Kreide in der Grundschule" },
            { id: "bs_10", q: "Wie würde ich am ehesten eine Bank ausrauben?", a: "Mit einer Wasserpistole und einer Socke über dem Kopf", b: "Ich würde höflich nach dem Geld fragen", c: "Mit einem extrem komplizierten Plan, der sofort scheitert", d: "Gar nicht, ich würde mich im Fluchtauto verfahren" },
            { id: "bs_11", q: "Wenn ich ein Möbelstück wäre, welches wäre ich am ehesten?", a: "Ein wackeliger Hocker", b: "Eine gemütliche, aber leicht fleckige Couch", c: "Ein Design-Regal, das niemand anfassen darf", d: "Die Minibar (immer gut gefüllt)" },
            { id: "bs_12", q: "Was ist am ehesten mein Move auf der Tanzfläche?", a: "Der betrunkene Onkel (rhythmisches Wippen)", b: "Der Staubsauger (extrem tief am Boden)", c: "Ich stehe nur am Rand und halte mein Getränk fest", d: "Ich bin der King/die Queen – Breakdance-Einlage inklusive" },
            { id: "bs_13", q: "Was wäre am ehesten die Schlagzeile nach meiner Verhaftung?", a: "Person versuchte, Eichhörnchen zu hypnotisieren", b: "Wegen zu lauten Singens unter der Dusche festgenommen", c: "Versuchter Diebstahl von Gratis-Proben im Drogeriemarkt", d: "Aus Versehen ins falsche Haus eingebrochen und dort eingeschlafen" },
            { id: "bs_14", q: "Was würde ich am ehesten tun, wenn ich eine dritte Hand am Rücken hätte?", a: "Mich endlich überall selbst kratzen können", b: "Profi-Jongleur werden", c: "Sie unter einem weiten Pulli verstecken und Leute erschrecken", d: "Damit beim Zocken gleichzeitig Pizza essen" },
            { id: "bs_15", q: "Wie viele Tage würde ich am ehesten im Dschungelcamp überleben?", a: "Ich würde schon beim Helikopterflug aussteigen", b: "Genau 3 Tage, bis das erste Insekt mich ansieht", c: "Ich würde gewinnen, weil ich alles esse", d: "Ich würde wegen Regelverstößen rausgeworfen" },
            { id: "bs_16", q: "Was ist am ehesten meine peinlichste Google-Suche der letzten Zeit?", a: "Wie koche ich Wasser?", b: "Ab wann ist man ein Erwachsener?", c: "Warum guckt mich meine Katze so wertend an?", d: "Promi XY nackt" },
            { id: "bs_17", q: "Wenn mein Leben eine Sitcom wäre, wie würde der Titelsong am ehesten klingen?", a: "Ein trauriges Saxophon-Solo", b: "Aggressiver Heavy Metal", c: "Eine fröhliche Pfeif-Melodie (die nervt)", d: "Der Sound eines abstürzenden Computers" },
            { id: "bs_18", q: "Was würde ich am ehesten tun, wenn ich unsichtbar wäre?", a: "Leute im Supermarkt erschrecken", b: "In geheime Meetings der Regierung schleichen", c: "Kostenlos ins Kino gehen", d: "Den ganzen Tag nackt draußen rumlaufen" },
            { id: "bs_19", q: "Welche fiktive Figur wäre am ehesten mein idealer bester Freund?", a: "Patrick Star (SpongeBob)", b: "Sherlock Holmes (für die Rätsel)", c: "Yoda (für die Lebensweisheiten)", d: "Der Grinch" },
            { id: "bs_20", q: "Was ist am ehesten mein Endgegner im Haushalt?", a: "Das Beziehen der Bettdecke", b: "Die Steuererklärung", c: "Das Ausräumen der Spülmaschine", d: "Socken, die nach dem Waschen keine Partner mehr haben" },
            { id: "bs_21", q: "Wie würde ich am ehesten heißen, wenn ich ein Rapper wäre?", a: "MC Müdigkeit", b: "Lil' Verpeilt", c: "Dr. Döner", d: "Money Schmutz" },
            { id: "bs_22", q: "Was wäre am ehesten das Schlimmste, was auf meinem Grabstein stehen könnte?", a: "Er/Sie hat das WLAN-Passwort mit ins Grab genommen.", b: "Er/Sie war stets bemüht.", c: "Habe ich den Herd ausgemacht?", d: "Ladebalken bei 99% stehen geblieben." },
            { id: "bs_23", q: "Wenn ich eine neue Sportart erfinden müsste, was wäre das am ehesten?", a: "Extrem-Couch-Chilling", b: "Synchron-Gähnen", c: "Wett-Einkaufswagen-Rennen", d: "Weitwurf mit nassen Socken" },
            { id: "bs_24", q: "Was wäre am ehesten mein letztes Abendmahl?", a: "Ein Eimer voll mit Pommes", b: "Ein 20-Gänge-Menü, um die Hinrichtung hinauszuzögern", c: "Eine Schüssel Müsli (mit Wasser, weil keine Milch da ist)", d: "Ein Glückskeks ohne Zettel" },
            { id: "bs_25", q: "Wie reagiere ich am ehesten, wenn ich im Fahrstuhl mit einer fremden Person stecke?", a: "Ich fange sofort an, meine ganze Lebensgeschichte zu erzählen", b: "Ich drücke panisch alle Knöpfe", c: "Ich lege mich schlafen, bis Hilfe kommt", d: "Ich tue so, als wäre ich der Techniker" },
            { id: "bs_26", q: "Welche App auf meinem Handy ist am ehesten peinlich?", a: "Eine App zum Kalorienzählen (die ich nie nutze)", b: "Ein Talking Tom Abklatsch", c: "Eine Dating-App für Haustierbesitzer", d: "Ein Spiel, für das ich schon echtes Geld ausgegeben habe" },
            { id: "bs_27", q: "Was würde ich am ehesten tun, wenn ich im Lotto gewinne (aber nur 1 Euro)?", a: "Ihn stolz einrahmen", b: "Eine einzige Kaugummi-Kugel kaufen", c: "Ihn jemandem schenken und so tun, als wäre ich großzügig", d: "Mich über die Steuer beschweren" },
            { id: "bs_28", q: "Wenn ich eine historische Person treffen könnte, wer wäre es am ehesten?", a: "Einstein (um ihn zu fragen, ob er meine Hausaufgaben macht)", b: "Cleopatra (um Schmink-Tipps zu bekommen)", c: "Napoleon (um zu sehen, wie klein er wirklich war)", d: "Der Erfinder des Rades (um ihn zu fragen: Warum nicht quadratisch?)" },
            { id: "bs_29", q: "Was ist am ehesten meine geheime Superkraft?", a: "Ich finde immer die langsamste Schlange an der Kasse", b: "Ich kann Dinge aufräumen, sodass sie nie wieder auftauchen", c: "Ich erkenne Schauspieler in Filmen, weiß aber nie ihren Namen", d: "Ich kann 12 Stunden am Stück schlafen und trotzdem müde sein" },
            { id: "bs_30", q: "Was ist am ehesten mein Spirit Animal beim Feiern?", a: "Die Grille (macht viel Lärm, man sieht sie aber nicht)", b: "Der Goldfisch (vergisst nach 3 Sekunden, welches Getränk er hat)", c: "Der Pfau (muss im Mittelpunkt stehen)", d: "Der Waschbär (sucht am Ende nur was zu essen)" },
            { id: "bs_31", q: "Wie würde ich am ehesten reagieren, wenn ich im falschen Zug sitze?", a: "Panisch bei der nächsten Station rausspringen", b: "So tun, als wäre das mein Plan gewesen", c: "Den Schaffner bestechen", d: "Einfach sitzen bleiben und ein neues Leben in der Zielstadt anfangen" },
            { id: "bs_32", q: "Was war am ehesten mein dümmster Kaufrausch?", a: "Ein Fitnessgerät, das jetzt als Kleiderständer dient", b: "50 Rollen Klopapier (nur zur Sicherheit)", c: "Ein aufblasbares Kostüm", d: "Eine DVD-Box einer Serie, die ich hasse" },
            { id: "bs_33", q: "Was ist am ehesten mein Lieblings-Schimpfwort?", a: "Ein klassisches Mist!", b: "Etwas sehr Kreatives wie Evolutionsbremse", c: "Nur wildes Gestikulieren", d: "Ein ganzer Schwall an Flüchen, die keinen Sinn ergeben" },
            { id: "bs_34", q: "Welches Klischee erfülle ich am ehesten voll und ganz?", a: "Der typische Deutsche (Handtuch auf die Liege)", b: "Das Chaos-Genie", c: "Der Früher war alles besser-Sager", d: "Der digitale Junkie (ohne WLAN kein Leben)" },
            { id: "bs_35", q: "Wenn ich eine Verschwörungstheorie starten müsste, welche wäre das am ehesten?", a: "Tauben sind eigentlich Kameras der Regierung", b: "Socken verschwinden in der Waschmaschine in eine andere Dimension", c: "Spiegel sind Fenster in eine Parallelwelt, aber die anderen sind schüchtern", d: "Avocados wurden erfunden, um Hipster zu kontrollieren" },
            { id: "bs_36", q: "Wie würde ich mein eigenes Land am ehesten nennen?", a: "Prokrastinationien", b: "Absurdistan", c: "Pommes-Land", d: "[Mein Name]-City" },
            { id: "bs_37", q: "Welche Art von kriminellem Mastermind wäre ich am ehesten?", a: "Der charmante Hochstapler", b: "Der Hacker, der im Keller Pizza isst", c: "Der Fluchtwagenfahrer, der ständig falsch abbiegt", d: "Derjenige, der aus Versehen den falschen Tresor knackt" },
            { id: "bs_38", q: "Wenn ich ein Emoji wäre, welches wäre ich am ehesten?", a: "😂 (Der Dauerlacher)", b: "🤡 (Der Klassenclown)", c: "💀 (Der Sarkastische)", d: "🫠 (Der, der mit dem Alltag überfordert ist)" },
            { id: "bs_39", q: "Was würde ich am ehesten tun, wenn ich in der Wildnis ausgesetzt werde?", a: "Versuchen, ein Feuer mit zwei Stöcken zu machen (und scheitern)", b: "Beeren essen, die mich am Ende halluzinieren lassen", c: "Versuchen, Freundschaft mit einem Bären zu schließen", d: "Nach 10 Minuten nach dem WLAN-Passwort suchen" },
            { id: "bs_40", q: "Was wäre am ehesten mein Beruf in einer mittelalterlichen Fantasy-Welt?", a: "Der tollpatschige Zauberlehrling", b: "Der Dorfälteste, der nur Rätsel spricht", c: "Der betrunkene Barde in der Taverne", d: "Der Drachenfütterer (mit sehr kurzer Lebenserwartung)" },
            { id: "bs_41", q: "Wie würde ich am ehesten reagieren, wenn ich ein Haar in meinem Essen im Restaurant finde?", a: "Den Manager verlangen und eine Szene machen", b: "Es diskret entfernen und einfach weiteressen", c: "Die ganze Zeit angewidert draufstarren, aber nichts sagen", d: "So tun, als wäre es mein eigenes, um niemanden zu belästigen" },
            { id: "bs_42", q: "Was würde ich am ehesten tun, wenn ich erfahre, dass mein Leben eine Truman Show ist?", a: "Direkt in die Kamera winken und Werbung für Eistee machen", b: "Versuchen, aus dem Set auszubrechen", c: "Mich über meine schlechte Gage beschweren", d: "Einfach weitermachen wie bisher, Hauptsache die Einschaltquoten stimmen" },
            { id: "bs_43", q: "Was ist am ehesten mein Verhalten bei einer Zombie-Invasion?", a: "Ich bin der Erste, der gebissen wird, weil ich den Zombie streicheln wollte", b: "Ich verbarrikadiere mich im nächsten Supermarkt in der Süßwarenabteilung", c: "Ich gründe eine neue Zivilisation in meinem Garten", d: "Ich versuche, die Zombies mit schlechten Witzen zu vertreiben" },
            { id: "bs_44", q: "Welches ungewöhnliche Haustier hätte ich am ehesten?", a: "Ein Alpaka (weil sie so flauschig sind)", b: "Ein Faultier (als Spiegelbild meiner Seele)", c: "Einen Pinguin, der im Kühlschrank wohnt", d: "Einen Waschbären, der mir beim Müllsortieren hilft" },
            { id: "bs_45", q: "Was würde ich am ehesten tun, wenn ich 24 Stunden lang die Zeit anhalten könnte?", a: "In Ruhe ausschlafen (endlich!)", b: "Leuten im Supermarkt die Einkaufswagen vertauschen", c: "In die Umkleidekabine von Promis schleichen", d: "Alle Hausarbeiten erledigen, um danach nie wieder was tun zu müssen" },
            { id: "bs_46", q: "Wie würde ich am ehesten reagieren, wenn ich eine peinliche Nachricht an die falsche Person schicke?", a: "Mein Handy sofort in den nächsten Fluss werfen", b: "So tun, als wäre mein Account gehackt worden", c: "Sofort 50 weitere Nachrichten schicken, um die erste zu überdecken", d: "Mit Ups, falscher Chat lol locker drüber weggehen" },
            { id: "bs_47", q: "Was wäre am ehesten meine Rolle in einer Zirkus-Show?", a: "Der Dompteur, der Angst vor Katzen hat", b: "Derjenige, der aus der Kanone geschossen wird", c: "Der tollpatschige Akrobat, der vom Seil fällt", d: "Die Person, die die Popcorn-Maschine bewacht" },
            { id: "bs_48", q: "Was würde ich am ehesten tun, wenn ich im Fahrstuhl mit meinem absoluten Idol feststecke?", a: "Ohnmächtig werden", b: "Die ganze Zeit über das Wetter reden, weil mir nichts Besseres einfällt", c: "Ein extrem verwackeltes Selfie machen", d: "Ihn/Sie fragen, ob ich mal am Parfum riechen darf" },
            { id: "bs_49", q: "Welche Sache würde ich am ehesten mit auf eine einsame Insel nehmen?", a: "Eine unendliche Vorratspackung Kaffee", b: "Meinen Laptop (auch ohne Internet)", c: "Eine riesige aufblasbare Badeinsel", d: "Ein Buch über Wie man ein Boot aus Sand baut" },
            { id: "bs_50", q: "Was würde ich am ehesten tun, wenn ich plötzlich fliegen könnte?", a: "Den Stau auf dem Weg zur Arbeit ignorieren", b: "Tauben jagen und sie erschrecken", c: "Fenster putzen in schwindelerregender Höhe", d: "Nach 5 Minuten feststellen, dass ich Höhenangst habe und wieder landen" }
        ]
    }
};

// Flache Liste aller Fragen mit Kategorie-Information und ID
export function getAllQuestions(activeCategories = []) {
    let allQuestions = [];
    if(activeCategories.length === 0) {
        // Falls keine Kategorien aktiv sind, verwende alle
        activeCategories = Object.keys(questionCategories);
    }
    
    activeCategories.forEach(catKey => {
        if(questionCategories[catKey] && questionCategories[catKey].questions) {
            questionCategories[catKey].questions.forEach(q => {
                // Füge Kategorie-Key hinzu, behalte ID
                allQuestions.push({ ...q, category: catKey });
            });
        }
    });
    return allQuestions;
}
