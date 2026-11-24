# Erzeugt epochs.json und evolution-options.json für Ages Up (TimeRun, 18 Stufen).
# Aufruf: python scripts/timerun/gen-data.py src/projects/TimeRun/data   (genes.json/upgrades.json werden von Hand gepflegt)
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapes import SHAPE, ART

OUT = sys.argv[1]

PHASES = {
    1: 'Die Welt der Einzeller',
    2: 'Zelluläre Komplexität & Vielzelligkeit',
    3: 'Ozean-Explosion & Landgang',
    4: 'Wirbeltier-Entfaltung & Primatenlinie',
    5: 'Hominiden, Kultur & Technik',
    6: 'Raumfahrt & interplanetarer Aufbruch',
}

# id, code, name, short, from, to (Kalenderjahr; negativ = vor Christus/vor heute), bg, grid, fact,
# Gegner [klein, mittel, groß] als (id, name, farbe), boss (id, name, farbe) oder None
S = [
 ('urzellen', '1.1', 'Präbiotische Chemie & Ur-Zellen', 'Ur-Zellen', -4.0e9, -3.8e9, '#0b2427', '#123a3d',
  'Fettsäuren bilden im Wasser von selbst Bläschen – ein Modell für die ersten Zellhüllen. RNA kann Information speichern und zugleich Reaktionen beschleunigen („RNA-Welt“).',
  [('aminosaeure', 'Aminosäure', '#9fe3c8'), ('rna-strang', 'RNA-Strang', '#f2c46b'), ('protozelle', 'Protozelle', '#7fc9e8')], None),
 ('stoffwechsel', '1.2', 'Stoffwechsel & Archaeen/Bakterien', 'Archaeen & Bakterien', -3.8e9, -2.7e9, '#0d2b2a', '#164240',
  'Archaeen und Bakterien trennten sich sehr früh. Zu den ältesten Fossilien gehören Stromatolithen – von Mikroben aufgebaute Kalkschichten, ca. 3,5 Mrd. Jahre alt (Australien).',
  [('bakterium', 'Bakterium', '#7ddf64'), ('archaee', 'Archaee', '#e0905a'), ('bakterienmatte', 'Bakterienmatte', '#5f9e6e')], None),
 ('photosynthese', '1.3', 'Sauerstoff-Photosynthese', 'Sauerstoff-Photosynthese', -2.7e9, -2.0e9, '#0e2e24', '#17473a',
  'Cyanobakterien setzen bei der Photosynthese Sauerstoff frei. Vor ca. 2,4 Mrd. Jahren reicherte er sich in der Luft an – für viele damalige Lebewesen war er giftig.',
  [('sauerstoffradikal', 'Sauerstoff-Radikal', '#ff6b6b'), ('purpurbakterium', 'Purpurbakterium', '#c27ae0'), ('cyanokolonie', 'Cyanobakterien-Kolonie', '#3fbf9f')],
  ('stromatolith', 'Stromatolith', '#8fae7a')),
 ('endosymbiose', '2.1', 'Endosymbiose & Zellkern', 'Endosymbiose & Zellkern', -2.0e9, -1.5e9, '#102a3a', '#1a3d52',
  'Eine Archaee nahm ein Bakterium auf, ohne es zu verdauen: Daraus wurden die Mitochondrien – die Kraftwerke in jeder deiner Zellen.',
  [('alphaproteobakterium', 'Alphaproteobakterium', '#ffb86b'), ('asgard-archaee', 'Asgard-Archaee', '#d98cff'), ('grypania', 'Grypania', '#6bc4a6')], None),
 ('kolonien', '2.2', 'Koloniebildung & Zellkommunikation', 'Kolonien', -1.5e9, -0.8e9, '#0f2638', '#1b3a54',
  'Bangiomorpha, eine Rotalge von vor ca. 1 Mrd. Jahren, ist einer der ältesten bekannten Mehrzeller mit verschiedenen Zelltypen. Kragengeißeltiere sind die nächsten einzelligen Verwandten der Tiere.',
  [('kragengeisseltier', 'Kragengeißeltier', '#a6e0ff'), ('bangiomorpha', 'Bangiomorpha (Rotalge)', '#e06b8a'), ('tappania', 'Tappania', '#c9b46b')], None),
 ('mehrzeller', '2.3', 'Echte Mehrzeller & Gewebe', 'Mehrzeller & Gewebe', -800e6, -540e6, '#13263a', '#213b55',
  'Die Ediacara-Fauna (ca. 575–540 Mio. Jahre) zeigt die ersten großen Lebewesen. Dickinsonia wurde bis 1,4 m groß – Fettmoleküle im Fossil zeigen, dass sie ein Tier war.',
  [('cloudina', 'Cloudina', '#e8e2c8'), ('kimberella', 'Kimberella', '#c98a5a'), ('charnia', 'Charnia', '#8ac98a')],
  ('dickinsonia', 'Dickinsonia', '#d9a66b')),
 ('kambrium', '3.1', 'Kambrische Diversifizierung', 'Kambrium', -541e6, -485e6, '#0c2340', '#16365e',
  'In der Kambrischen Explosion entstanden in wenigen Millionen Jahren fast alle heutigen Tierstämme. Trilobiten hatten schon Facettenaugen mit Linsen aus Kalkspat.',
  [('hallucigenia', 'Hallucigenia', '#ff9ab0'), ('trilobit', 'Trilobit', '#b89a6b'), ('anomalocaris', 'Anomalocaris', '#e0603a')], None),
 ('landgang', '3.2', 'Eroberung des Festlands', 'Landgang', -470e6, -400e6, '#1d2a17', '#2c4022',
  'Pflanzen und Pilze besiedelten zuerst das Land, dann folgten Gliederfüßer: Der Tausendfüßer Pneumodesmus lebte vor über 410 Mio. Jahren und ist eines der ältesten bekannten Landtiere.',
  [('rhyniella', 'Springschwanz (Rhyniella)', '#d8d8a0'), ('pneumodesmus', 'Tausendfüßer (Pneumodesmus)', '#a8643c'), ('eurypterus', 'Seeskorpion (Eurypterus)', '#7a8a5a')], None),
 ('landwirbeltiere', '3.3', 'Landwirbeltiere & Samenpflanzen', 'Landwirbeltiere', -380e6, -320e6, '#1a2814', '#2a3e1f',
  'Tiktaalik (ca. 375 Mio. Jahre) war ein Fisch mit Hals und kräftigen Flossen – ein Übergang zu den Vierbeinern. Samen und das Amniotenei machten Pflanzen und Tiere vom offenen Wasser unabhängig.',
  [('acanthostega', 'Acanthostega', '#8ab06b'), ('pulmonoscorpius', 'Riesenskorpion (Pulmonoscorpius)', '#c08a4a'), ('arthropleura', 'Arthropleura', '#6b5a3a')],
  ('dunkleosteus', 'Dunkleosteus', '#6b7f99')),
 ('dinosaurier', '4.1', 'Amnioten, Dinosaurier & frühe Säuger', 'Dinosaurier', -320e6, -66e6, '#24261a', '#383b26',
  'Dinosaurier gab es ca. 165 Mio. Jahre lang. Die ersten Säugetiere lebten schon neben ihnen – meist klein und nachtaktiv.',
  [('compsognathus', 'Compsognathus', '#a6c46b'), ('velociraptor', 'Velociraptor', '#c9935a'), ('triceratops', 'Triceratops', '#8a7a5a')], None),
 ('saeugetiere', '4.2', 'Säugetier-Aufstieg & Warmblütigkeit', 'Säugetier-Aufstieg', -66e6, -55e6, '#26221a', '#3b3426',
  'Vor 66 Mio. Jahren schlug bei Chicxulub (Mexiko) ein Asteroid ein. Die Nicht-Vogel-Dinosaurier starben aus, die Säugetiere breiteten sich aus. Vögel sind die überlebenden Dinosaurier.',
  [('purgatorius', 'Purgatorius', '#b89a7a'), ('gastornis', 'Gastornis', '#7a6b8a'), ('titanoboa', 'Titanoboa', '#5a7a4a')], None),
 ('primaten', '4.3', 'Primaten, Greifhände & Sozialität', 'Primaten', -55e6, -6e6, '#1c2a1a', '#2c4128',
  'Primaten entwickelten nach vorn gerichtete Augen für räumliches Sehen und Greifhände mit Nägeln statt Krallen. Vor ca. 7–6 Mio. Jahren trennten sich die Linien von Schimpanse und Mensch.',
  [('hyaenodon', 'Hyaenodon', '#9a8a6a'), ('entelodont', 'Entelodont', '#7a5a4a'), ('deinotherium', 'Deinotherium', '#8a8a8a')],
  ('andrewsarchus', 'Andrewsarchus', '#6a4a3a')),
 ('hominiden', '5.1', 'Aufrechter Gang & Steinwerkzeuge', 'Aufrechter Gang', -6e6, -1.8e6, '#2b2419', '#403526',
  'Lucy (Australopithecus afarensis, ca. 3,2 Mio. Jahre) ging schon aufrecht. Die ältesten bekannten Steinwerkzeuge sind ca. 3,3 Mio. Jahre alt (Lomekwi, Kenia).',
  [('pachycrocuta', 'Riesenhyäne (Pachycrocuta)', '#b0a07a'), ('dinofelis', 'Dinofelis', '#d0a04a'), ('homotherium', 'Homotherium', '#a0804a')], None),
 ('jaeger-sammler', '5.2', 'Sprache, Feuer & Jäger-Sammler-Kulturen', 'Feuer & Sprache', -1.8e6, -10000, '#2b2119', '#3f3126',
  'Homo erectus nutzte wohl als Erster das Feuer und verließ Afrika. Unsere Art, Homo sapiens, entstand vor ca. 300.000 Jahren in Afrika.',
  [('hoehlenhyaene', 'Höhlenhyäne', '#a9a088'), ('hoehlenbaer', 'Höhlenbär', '#6e4a32'), ('wollnashorn', 'Wollnashorn', '#8a7660')], None),
 ('zivilisation', '5.3', 'Sesshaftigkeit, Schrift & Industrie/Digitaltechnik', 'Sesshaftigkeit & Industrie', -10000, 1957, '#24231f', '#3a382f',
  'Ab ca. 9.500 v. Chr. begann im Fruchtbaren Halbmond die Landwirtschaft. Schrift gibt es seit ca. 3.300 v. Chr. (Mesopotamien), Dampfmaschinen seit dem 18. Jahrhundert.',
  [('hausratte', 'Hausratte', '#8a8378'), ('heuschrecken', 'Heuschreckenschwarm', '#b5b04a'), ('auerochse', 'Auerochse', '#5a4030')],
  ('pest', 'Schwarzer Tod (Pest)', '#3a3f4a')),
 ('erdorbit', '6.1', 'Erdorbit & unbemannte Erkundung', 'Erdorbit', 1957, 2026, '#0c0f1e', '#171c33',
  'Am 4. Oktober 1957 startete Sputnik 1, der erste Satellit. 1969 betraten Menschen den Mond, seit dem Jahr 2000 ist die ISS dauerhaft bewohnt.',
  [('mikrometeoroid', 'Mikrometeoroid', '#c8c8d8'), ('weltraumschrott', 'Weltraumschrott', '#9aa0aa'), ('raketenstufe', 'Ausgebrannte Raketenstufe', '#d0d4dc')], None),
 ('mond-mars', '6.2', 'Mond, Mars & geschlossene Lebenserhaltung', 'Mond & Mars', 2026, 2055, '#1a1010', '#2e1c1a',
  'Zukunft – noch nicht passiert. Geplant sind Stationen auf dem Mond; auf dem Mars bräuchte man Strahlungsschutz und Wasser aus dem Eis im Boden.',
  [('mondstaub', 'Mondstaub', '#c8c0b0'), ('staubteufel', 'Marsstaubteufel', '#c0603a'), ('sonnensturm', 'Sonnensturm-Teilchen', '#ffd060')], None),
 ('tiefraum', '6.3', 'Interplanetare & tiefe Raumfahrt', 'Tiefe Raumfahrt', 2055, 2300, '#07071a', '#14143a',
  'Zukunft – noch nicht passiert. Selbst Licht braucht zum nächsten Stern (Proxima Centauri) über 4 Jahre. Voyager 1 ist seit 1977 unterwegs und erreichte 2012 den interstellaren Raum.',
  [('kosmische-strahlung', 'Kosmische Strahlung', '#a0e0ff'), ('kometenbrocken', 'Kometenbrocken', '#d8f0ff'), ('eisasteroid', 'Eisasteroid', '#90a8c0')],
  ('asteroid', 'Erdnaher Asteroid', '#7a6a5a')),
]

HEIGHT = 4000

def px(v):
    return round(v / HEIGHT, 4)

def waves(ids, early):
    # nach HÖHE: from/to/every als Anteil der Stufenhöhe (0…1). Wer stehen bleibt, bekommt keine neuen Wellen.
    s, m, b = ids
    f = 1.4 if early else 1.0   # Phase 1–2 lichter
    return [
        {'enemy': s, 'from': 0, 'to': 1, 'every': px(200 if early else 280), 'count': 2},   # Beute/kleine Gegner
        {'enemy': m, 'from': 0.12, 'to': 1, 'every': px(520 * f), 'count': 1},
        {'enemy': s, 'from': 0.35, 'to': 1, 'every': px(150 if early else 190), 'count': 2},
        {'enemy': b, 'from': 0.3, 'to': 1, 'every': px(800 * f), 'count': 1},
        {'enemy': m, 'from': 0.55, 'to': 1, 'every': px(300 * f), 'count': 2},
        {'enemy': s, 'from': 0.7, 'to': 1, 'every': px(140 * f), 'count': 2},
    ]

def ambient(ids):
    # nach ZEIT, nur wenig: ein großer Jäger ab und zu – Stehenbleiben ist nicht sicher, bringt aber kaum XP
    return [{'enemy': ids[2], 'from': 6, 'to': 100000, 'every': 7, 'count': 1}]

FACTS = {
 'urzellen': ['Die Erde ist rund 4,5 Mrd. Jahre alt. Winzige Zirkon-Kristalle aus Australien sind etwa 4,4 Mrd. Jahre alt und deuten auf frühe Ozeane hin.',
              'Im Miller-Urey-Versuch (1953 veröffentlicht) entstanden aus Gasen, Wasser und künstlichen Blitzen von selbst Aminosäuren – Bausteine des Lebens.'],
 'stoffwechsel': ['Alles heutige Leben hat einen gemeinsamen Vorfahren, genannt LUCA. Er lebte vermutlich vor mehr als 3,5 Mrd. Jahren – manche Studien schätzen sogar über 4 Mrd.',
                  'Viele frühe Mikroben lebten ohne Sauerstoff, etwa von Wasserstoff, Schwefel oder Eisen – so wie heute noch Mikroben an heißen Quellen der Tiefsee.'],
 'photosynthese': ['Durch den Sauerstoff rostete gelöstes Eisen im Meer und sank zu Boden. So entstanden gebänderte Eisenerze – bis heute eine wichtige Quelle für Eisen.',
                   'Aus Sauerstoff bildete sich hoch in der Atmosphäre die Ozonschicht. Sie hält UV-Strahlung ab und machte später das Leben an Land möglich.'],
 'endosymbiose': ['Mitochondrien haben bis heute ein eigenes kleines Erbgut – ein Hinweis darauf, dass sie einmal eigenständige Bakterien waren.',
                  'Algen und Pflanzen nahmen zusätzlich ein Cyanobakterium auf. Daraus wurden die Chloroplasten, in denen die Photosynthese stattfindet.'],
 'kolonien': ['Bangiomorpha ist auch der älteste bekannte Hinweis auf geschlechtliche Fortpflanzung – also das Mischen des Erbguts zweier Eltern.',
              'Der Schleimpilz Dictyostelium lebt als Einzeller. Bei Nahrungsmangel schließen sich viele Zellen über Botenstoffe zu einem gemeinsamen Körper zusammen.'],
 'mehrzeller': ['Vor etwa 720–635 Mio. Jahren war die Erde vermutlich mehrmals fast ganz vereist („Schneeball-Erde“). Danach breiteten sich größere Lebewesen aus.',
                'Schwämme gehören zu den ältesten Tiergruppen. Sie haben weder Organe noch Nerven – ihre Zellen arbeiten trotzdem zusammen.'],
 'kambrium': ['Im Burgess-Schiefer (Kanada, ca. 508 Mio. Jahre) sind Fossilien so gut erhalten, dass sogar Weichteile zu sehen sind.',
              'Pikaia und Haikouichthys gehören zu den frühesten bekannten Chordatieren – der Gruppe, zu der auch alle Wirbeltiere und damit du gehören.'],
 'landgang': ['Die ersten Landpflanzen waren winzig und hatten noch keine echten Wurzeln und Blätter – ähnlich wie heutige Moose.',
              'Pilze halfen den Pflanzen beim Landgang: Ihre Fäden versorgen Wurzeln mit Wasser und Mineralien (Mykorrhiza) – eine Partnerschaft bis heute.'],
 'landwirbeltiere': ['Im Karbon (ca. 359–299 Mio. Jahre) wuchsen riesige Sumpfwälder aus Bärlappbäumen und Farnen. Aus ihnen entstand ein großer Teil der Steinkohle.',
                     'Acanthostega hatte schon Beine mit acht Fingern, lebte aber noch hauptsächlich im Wasser.'],
 'dinosaurier': ['Vor 252 Mio. Jahren starben beim größten Massenaussterben der Erdgeschichte rund 80–90 % der Meeresarten aus (Perm-Trias-Grenze).',
                 'Vögel stammen von kleinen gefiederten Dinosauriern ab. Archaeopteryx (ca. 150 Mio. Jahre) zeigt Merkmale von beiden.'],
 'saeugetiere': ['Vor etwa 56 Mio. Jahren erwärmte sich die Erde rasch um mehrere Grad. In dieser Zeit tauchen viele heutige Säugetiergruppen auf, auch die ersten echten Primaten.',
                 'Gastornis war ein bis zu 2 m großer, flugunfähiger Vogel. Lange galt er als Raubtier – heute vermuten Forscher, dass er Pflanzen fraß.'],
 'primaten': ['Wale stammen von Landtieren ab: Pakicetus (ca. 50 Mio. Jahre) lief noch auf vier Beinen. Die nächsten heutigen Verwandten der Wale sind Flusspferde.',
              'Vor etwa 34 Mio. Jahren kühlte die Erde stark ab, und in der Antarktis bildeten sich dauerhafte Eisschilde.'],
 'hominiden': ['In Laetoli (Tansania) sind 3,66 Mio. Jahre alte Fußspuren erhalten – Vormenschen liefen dort aufrecht durch frische Vulkanasche.',
               'Vor etwa 2,8 Mio. Jahren taucht die Gattung Homo auf. Homo habilis („geschickter Mensch“) stellte einfache Steinwerkzeuge her.'],
 'jaeger-sammler': ['Die ältesten bekannten Höhlenmalereien sind über 40.000 Jahre alt, zum Beispiel auf der indonesischen Insel Sulawesi.',
                    'Neandertaler lebten bis vor etwa 40.000 Jahren in Europa. Menschen außerhalb Afrikas tragen heute noch etwa 1–2 % Neandertaler-Erbgut in sich.'],
 'zivilisation': ['Die Pyramiden von Gizeh entstanden vor etwa 4.500 Jahren. Damals lebten auf der Wrangel-Insel (Sibirien) noch Wollhaarmammuts.',
                  '1928 entdeckte Alexander Fleming das Penicillin. Das erste Antibiotikum veränderte die Medizin.'],
 'erdorbit': ['Seit 1990 umkreist das Hubble-Teleskop die Erde. Seit 2022 liefert das James-Webb-Teleskop Bilder aus der Frühzeit des Universums.',
              'Um die Erde kreisen rund eine Million Teile Weltraumschrott, die größer als 1 cm sind. Schon so ein Splitter kann einen Satelliten beschädigen.'],
 'mond-mars': ['Ein Flug zum Mars dauert mit heutigen Raketen etwa 6–9 Monate. Funksignale brauchen je nach Abstand 3 bis 22 Minuten.',
               'Auf dem Mars beträgt der Luftdruck weniger als 1 % des Drucks auf der Erde – ohne Druckanzug könnte man dort nicht überleben.'],
 'tiefraum': ['Mit heutigen Raumsonden würde ein Flug zu Proxima Centauri über 70.000 Jahre dauern.',
              'Forscher haben schon über 5.000 Planeten bei anderen Sternen entdeckt, sogenannte Exoplaneten.'],
}

epochs = []
for i, (eid, code, name, short, f, t, bg, grid, fact, en, boss) in enumerate(S):
    k = 1 + 0.32 * i
    sp = 1 + 0.02 * i
    base = [
        dict(size=10, hp=3, speed=68, damage=3, xp=1),
        dict(size=15, hp=8, speed=44, damage=5, xp=2),
        dict(size=24, hp=20, speed=27, damage=9, xp=5),
    ]
    early = int(code[0]) <= 2
    enemies = []
    for j, ((xid, xname, col), b) in enumerate(zip(en, base)):
        x = {'id': xid, 'name': xname, 'color': col, 'size': b['size'],
             'hp': round(b['hp'] * k, 1), 'speed': round(b['speed'] * sp),
             'damage': round(b['damage'] * (1 + 0.22 * i), 1), 'xp': max(1, round(b['xp'] * (1 + 0.15 * i)))}
        # Einzeller & frühe Mehrzeller jagen nicht: kleine/mittlere treiben mit der Strömung (harmlos), nur die großen jagen
        if early and j < 2:
            x['behavior'] = 'drift'
        x['shape'] = SHAPE[xid]
        if early:
            # Paket 1: farbige Pixel-Figur + doppelte Größe (Hauptfigur 32 px)
            x['art'] = ART[xid]
            x['size'] = [20, 34, 46][j]
        enemies.append(x)
    ids = [x[0] for x in en]
    e = {'id': eid, 'code': code, 'order': i + 1, 'phase': int(code[0]), 'phaseName': PHASES[int(code[0])],
         'name': name, 'shortName': short, 'fromYear': f, 'toYear': t, 'facts': [fact] + FACTS[eid],
         'background': bg, 'gridColor': grid, 'height': HEIGHT, 'enemies': enemies,
         'waves': waves(ids, early), 'ambient': ambient(ids)}
    if boss:
        e['boss'] = {'id': boss[0], 'name': boss[1], 'color': boss[2], 'size': 60, 'shape': SHAPE[boss[0]],
                     'hp': round(300 * k), 'speed': round(32 * sp), 'damage': round(14 * (1 + 0.22 * i)), 'xp': round(30 * (1 + 0.3 * i))}
        # harmlos wie in Wirklichkeit: Stromatolith steht still, Dickinsonia hatte keinen Mund
        if boss[0] == 'stromatolith': e['boss'].update(speed=0, damage=0)
        if boss[0] == 'dickinsonia': e['boss'].update(speed=6, damage=0)
        if early: e['boss'].update(art=ART[boss[0]], size=84)
    epochs.append(e)

info = ('Stufen nach der Evolution (1.1–6.3). fromYear/toYear = Kalenderjahre (negativ = v. Chr. bzw. vor heute), '
        'innerhalb einer Stufe läuft die Zeit gleichmäßig mit der Höhe. height = Strecke bis zur Ziellinie; boss nur am Ende einer Hauptphase. '
        'waves nach HÖHE: from/to/every als Anteil der Stufenhöhe (0–1); ambient nach Zeit in Sekunden (wenig). facts = Bodentexte (verteilt über die Stufe). behavior drift = treibt, harmlos. variants (optional): erste passende Variante ändert Name/Farben/Wellen.')
json.dump({'_info': info, 'epochs': epochs}, open(os.path.join(OUT, 'epochs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# Evolution-Optionen: stage = Stufe, die man mit der Wahl betritt. real = so ist es in unserer Zeitlinie passiert.
O = []
def opt(id, stage, name, desc, grants, requires=(), excludes=(), general=False, real=False):
    o = {'id': id, 'stage': stage, 'name': name, 'description': desc,
         'requires': list(requires), 'excludes': list(excludes), 'grants': list(grants)}
    if general: o['general'] = True
    if real: o['real'] = True
    O.append(o)

opt('archaee', 'stoffwechsel', 'Archaee', 'Lebt auch in heißen Quellen. Aus dieser Linie stammt später der Wirt unserer Zellen.', ['archaee'], general=True, real=True)
opt('bakterium', 'stoffwechsel', 'Bakterium', 'Die zweite große Linie der Einzeller – heute die häufigsten Lebewesen der Erde.', ['bakterium'])
opt('chemolithotroph', 'stoffwechsel', 'Mineralien-Fresser', 'Gewinnt Energie aus Mineralien, wie Mikroben an Schwarzen Rauchern der Tiefsee.', ['chemo', 'tiefsee'])

opt('sauerstoff-ueberlebender', 'photosynthese', 'Sauerstoff-Überlebender', 'Entwickelt Schutz vor dem giftigen Sauerstoff – und nutzt ihn später sogar.', ['aerob'], general=True, real=True)
opt('cyanobakterium', 'photosynthese', 'Cyanobakterium', 'Spaltet Wasser mit Sonnenlicht und setzt dabei Sauerstoff frei.', ['photosynthese', 'licht'], requires=['bakterium'])
opt('anaerob', 'photosynthese', 'Rückzug ohne Sauerstoff', 'Weicht in sauerstofffreie Nischen aus – wie viele Archaeen bis heute.', ['anaerob'], excludes=['photosynthese'])

opt('mitochondrien', 'endosymbiose', 'Mitochondrien aufnehmen', 'Ein aufgenommenes Bakterium wird zum Kraftwerk der Zelle. Es entstehen Zellen mit Zellkern (Eukaryoten).', ['eukaryot', 'mitochondrien'], general=True, real=True)
opt('chloroplasten', 'endosymbiose', 'Cyanobakterium aufnehmen', 'Ein aufgenommenes Cyanobakterium wird zum Chloroplasten – so entstehen Algen und später Pflanzen.', ['eukaryot', 'chloroplast'], requires=['aerob'])
opt('prokaryot-bleiben', 'endosymbiose', 'Einfach bleiben', 'Bleibt ein schneller, einfacher Einzeller ohne Zellkern.', ['prokaryot'], requires=['bakterium'])

opt('kragengeissel-kolonie', 'kolonien', 'Kragengeißeltier-Kolonie', 'Zellen bleiben nach der Teilung zusammen und tauschen Signale aus – Vorstufe der Tiere.', ['kolonie', 'tier'], general=True, real=True)
opt('rotalgen-verband', 'kolonien', 'Rotalgen-Verband', 'Wie Bangiomorpha: Zellen mit verteilten Aufgaben, die Licht zur Energie nutzen.', ['kolonie', 'pflanze'], requires=['chloroplast'])
opt('pilzgeflecht', 'kolonien', 'Pilzgeflecht', 'Feine Zellfäden durchziehen den Untergrund und zersetzen totes Material.', ['pilz'])

opt('gewebe-nerven', 'mehrzeller', 'Gewebe & Nervenzellen', 'Spezialisierte Zellen bilden Gewebe; Nervenzellen leiten Signale durch den Körper.', ['nerven', 'tier'], general=True, real=True)
opt('schwamm', 'mehrzeller', 'Schwamm', 'Festsitzend, filtert Nahrung aus dem Wasser – eine der ältesten Tiergruppen.', ['filtrierer', 'sessil'], requires=['tier'])
opt('ediacara-wedel', 'mehrzeller', 'Ediacara-Wedel', 'Wie Charnia: ein farnartiger Körper am Meeresboden.', ['ediacara', 'sessil'])

opt('chorda', 'kambrium', 'Rückensaite (Chorda)', 'Wie Pikaia: ein biegsamer Stab im Rücken – Vorläufer der Wirbelsäule.', ['chordatier'], general=True, real=True)
opt('gliederpanzer', 'kambrium', 'Gliederfüßer-Panzer', 'Ein Außenskelett mit Gelenkbeinen, wie bei Trilobiten.', ['gliederfüsser', 'panzer'])
opt('greifarme', 'kambrium', 'Räuberische Greifarme', 'Wie Anomalocaris: große Augen und Greifarme – einer der ersten Spitzenräuber.', ['räuber'], requires=['nerven'])

opt('kiefer-knochen', 'landgang', 'Kiefer & Knochen', 'Im Meer entstehen Fische mit Kiefern und Knochen – unsere Vorfahren bleiben noch im Wasser.', ['kiefer', 'fisch', 'wasser'], general=True, real=True)
opt('an-land-kriechen', 'landgang', 'An Land kriechen', 'Gliederfüßer wie Tausendfüßer verlassen als erste Tiere das Wasser.', ['land'], requires=['gliederfüsser'])
opt('panzerfisch', 'landgang', 'Kieferloser Panzerfisch', 'Fische ohne Kiefer, aber mit Knochenpanzer – sie lebten zu dieser Zeit in Meeren und Flüssen.', ['fisch', 'panzer', 'wasser'])
opt('landpflanze', 'landgang', 'Landpflanze', 'Mit Wachsschicht und Leitungsbahnen besiedeln Pflanzen das Festland.', ['land', 'pflanze'], requires=['chloroplast'])

opt('vierbeiner', 'landwirbeltiere', 'Fleischflosser an Land', 'Kräftige Flossen werden zu Beinen, Lungen atmen Luft – wie bei Tiktaalik.', ['land', 'vierbeiner', 'luftatmer'], general=True, real=True)
opt('riesen-arthropode', 'landwirbeltiere', 'Riesen-Gliederfüßer', 'Riesen wie Arthropleura wurden bis 2,6 m lang – vermutlich half der hohe Sauerstoffgehalt der Luft.', ['land', 'riese'], requires=['gliederfüsser'])
opt('hai', 'landwirbeltiere', 'Im Meer bleiben (Hai)', 'Knorpelfische wie Haie gibt es seit über 400 Mio. Jahren – bis heute.', ['wasser', 'räuber'], requires=['kiefer'])

opt('synapside', 'dinosaurier', 'Säugetierähnliche (Synapsiden)', 'Aus Amnioten mit einem Schläfenfenster entwickeln sich die Vorfahren der Säugetiere.', ['synapside', 'amniot'], general=True, real=True)
opt('dinosaurier-linie', 'dinosaurier', 'Dinosaurier', 'Aufrechte Beine unter dem Körper – die Dinosaurier beherrschen das Land.', ['reptil', 'dinosaurier', 'amniot'], requires=['vierbeiner'])
opt('krokodil-linie', 'dinosaurier', 'Krokodil-Linie', 'Panzerechsen mit kräftigem Biss – die Krokodile überdauern bis heute.', ['reptil', 'krokodil', 'räuber', 'amniot'], requires=['vierbeiner'])

opt('kleiner-saeuger', 'saeugetiere', 'Kleiner Säuger überlebt', 'Klein, warmblütig, im Bau versteckt – Säugetiere überstehen den Einschlag.', ['säuger', 'warmblut'], general=True, real=True)
opt('grosser-pflanzenfresser', 'saeugetiere', 'Großer Pflanzenfresser', 'Wie Coryphodon (vor ca. 58 Mio. Jahren): einer der ersten großen Säuger nach den Dinosauriern.', ['säuger', 'gross', 'pflanzenfresser'])
opt('vogel', 'saeugetiere', 'Vögel (letzte Dinosaurier)', 'Gefiederte Dinosaurier überleben als Vögel.', ['vogel', 'luft'], requires=['dinosaurier'])
opt('krokodil-ueberlebt', 'saeugetiere', 'Krokodile überleben', 'Krokodile überstehen das Massenaussterben – vermutlich, weil sie lange ohne Nahrung auskommen.', ['krokodil'], requires=['krokodil'])

opt('greifhaende', 'primaten', 'Greifhände & räumliches Sehen', 'Nach vorn gerichtete Augen und Hände mit Nägeln – ideal für das Leben in Bäumen.', ['primat', 'greifhand'], requires=['säuger'], real=True)
opt('gruppenleben', 'primaten', 'Gruppenleben', 'In der Gruppe ist man sicherer und findet besser Nahrung.', ['sozial'], general=True)
opt('grosses-raubtier', 'primaten', 'Großes Raubtier', 'Wie Andrewsarchus: ein großer Fleischfresser an Land.', ['räuber', 'gross'], requires=['warmblut'])

opt('aufrechter-gang', 'hominiden', 'Aufrechter Gang & Steinwerkzeug', 'Auf zwei Beinen sind die Hände frei: Steine werden zu Werkzeugen.', ['zweibeiner', 'werkzeug'], requires=['primat'], real=True)
opt('werkzeugnutzer', 'hominiden', 'Werkzeugnutzer', 'Auch Krähen, Otter und Schimpansen nutzen heute Werkzeuge.', ['werkzeug'], general=True)
opt('schwarmjagd', 'hominiden', 'Gemeinsame Jagd', 'Wie Hyänen: im Rudel erlegt man größere Beute.', ['rudel', 'jäger'], requires=['sozial'])

opt('feuer-sprache', 'jaeger-sammler', 'Feuer & Sprache', 'Gekochte Nahrung, Wärme und Schutz – und Sprache, um Wissen weiterzugeben.', ['feuer', 'sprache'], requires=['werkzeug'], real=True)
opt('jaeger-sammler-gruppe', 'jaeger-sammler', 'Jäger und Sammler', 'Wandert mit den Jahreszeiten und kennt jede Pflanze der Gegend.', ['jäger', 'sammler'], general=True)
opt('kuestenleben', 'jaeger-sammler', 'Leben an der Küste', 'Muscheln und Fisch als Nahrung – Küsten waren wichtige Wanderwege.', ['wasser', 'küste'], requires=['werkzeug'])

opt('ackerbau-schrift', 'zivilisation', 'Ackerbau, Schrift & Industrie', 'Felder, Städte, Schrift, Wissenschaft – und schließlich Maschinen.', ['ackerbau', 'schrift', 'industrie'], requires=['sprache'], real=True)
opt('handel-handwerk', 'zivilisation', 'Handel & Handwerk', 'Werkstätten und Handelswege verbinden Völker und Ideen.', ['handel', 'industrie'], general=True)
opt('nomaden', 'zivilisation', 'Nomaden-Kultur', 'Mit Herden durch Steppen ziehen – wie viele Völker bis heute.', ['nomade'])

opt('satelliten', 'erdorbit', 'Satelliten & Raumstationen', 'Sputnik, Mondlandung, ISS: der Mensch verlässt die Erde.', ['raumfahrt', 'orbit'], requires=['industrie'], real=True)
opt('funkteleskope', 'erdorbit', 'Teleskope & Sonden', 'Unbemannte Sonden und Teleskope erkunden die Planeten.', ['astronomie', 'raumfahrt'], general=True)
opt('meeresforschung', 'erdorbit', 'Tiefsee-Forschung', 'Tauchboote erreichen 1960 den tiefsten Punkt der Ozeane (Marianengraben).', ['tiefsee', 'habitat'], requires=['wasser'])

opt('mondstation', 'mond-mars', 'Mondstation', 'Zukunft: eine dauerhafte Station am Mond-Südpol, wo Eis vermutet wird.', ['mond'], general=True)
opt('mars-siedlung', 'mond-mars', 'Mars-Siedlung', 'Zukunft: Kuppeln mit Strahlungsschutz und Wasser aus dem Marseis.', ['mars'], requires=['raumfahrt'])
opt('unterwasser-technik', 'mond-mars', 'Habitat-Technik aus der Tiefsee', 'Zukunft: Erfahrung mit Unterwasser-Habitaten hilft bei geschlossenen Kreisläufen.', ['habitat', 'kreislauf'], requires=['habitat'])

opt('sonnensegel', 'tiefraum', 'Sonnensegel-Sonden', 'Zukunft: winzige Sonden, die vom Licht angetrieben werden.', ['sonde'], general=True)
opt('generationenschiff', 'tiefraum', 'Generationenschiff', 'Zukunft: ein Schiff, auf dem viele Generationen leben, bis es ankommt.', ['interstellar'], requires=['raumfahrt'])
opt('krokodil-astronauten', 'tiefraum', 'Krokodil-Astronauten', 'Eine andere Zeitlinie: Hier haben Krokodile die Raumfahrt erfunden.', ['krokodil-astronaut'], requires=['krokodil', 'raumfahrt'])

json.dump({'_info': 'stage = Stufe, die man mit der Wahl betritt. requires: alle Tags nötig, excludes: keiner erlaubt, grants: neue Tags. general = immer wählbar (keine Sackgasse). real = so ist es in unserer Zeitlinie passiert (nur bis heute).',
           'options': O}, open(os.path.join(OUT, 'evolution-options.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# genes.json wird von Hand gepflegt (Fressen, Waffenformen) – nicht mehr erzeugen
print(len(epochs), 'Stufen,', len(O), 'Optionen')
