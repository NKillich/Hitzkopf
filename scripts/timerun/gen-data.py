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

# id, code, name, short, from, to (Kalenderjahr; negativ = vor Christus/vor heute), bg, grid,
# Gegner [klein, mittel, groß] als (id, name, farbe), boss (id, name, farbe) oder None
S = [
 ('urzellen', '1.1', 'Präbiotische Chemie & Ur-Zellen', 'Ur-Zellen', -4.0e9, -3.8e9, '#0b2427', '#123a3d',
  [('aminosaeure', 'Aminosäure', '#9fe3c8'), ('rna-strang', 'RNA-Strang', '#f2c46b'), ('protozelle', 'Protozelle', '#7fc9e8')], None),
 ('stoffwechsel', '1.2', 'Stoffwechsel & Archaeen/Bakterien', 'Archaeen & Bakterien', -3.8e9, -2.7e9, '#0d2b2a', '#164240',
  [('bakterium', 'Bakterium', '#7ddf64'), ('archaee', 'Archaee', '#e0905a'), ('bakterienmatte', 'Bakterienmatte', '#5f9e6e')], None),
 ('photosynthese', '1.3', 'Sauerstoff-Photosynthese', 'Photosynthese', -2.7e9, -2.0e9, '#0e2e24', '#17473a',
  [('sauerstoffradikal', 'Sauerstoff-Radikal', '#ff6b6b'), ('purpurbakterium', 'Purpurbakterium', '#c27ae0'), ('cyanokolonie', 'Cyanobakterien-Kolonie', '#3fbf9f')],
  ('stromatolith', 'Stromatolith', '#8fae7a')),
 ('endosymbiose', '2.1', 'Endosymbiose & Zellkern', 'Endosymbiose', -2.0e9, -1.5e9, '#102a3a', '#1a3d52',
  [('alphaproteobakterium', 'Alphaproteobakterium', '#ffb86b'), ('asgard-archaee', 'Asgard-Archaee', '#d98cff'), ('grypania', 'Grypania', '#6bc4a6')], None),
 ('kolonien', '2.2', 'Koloniebildung & Zellkommunikation', 'Kolonien', -1.5e9, -0.8e9, '#0f2638', '#1b3a54',
  [('kragengeisseltier', 'Kragengeißeltier', '#a6e0ff'), ('bangiomorpha', 'Bangiomorpha (Rotalge)', '#e06b8a'), ('tappania', 'Tappania', '#c9b46b')], None),
 ('mehrzeller', '2.3', 'Echte Mehrzeller & Gewebe', 'Mehrzeller & Gewebe', -800e6, -540e6, '#13263a', '#213b55',
  [('cloudina', 'Cloudina', '#e8e2c8'), ('kimberella', 'Kimberella', '#c98a5a'), ('charnia', 'Charnia', '#8ac98a')],
  ('dickinsonia', 'Dickinsonia', '#d9a66b')),
 ('kambrium', '3.1', 'Kambrische Diversifizierung', 'Kambrium', -541e6, -485e6, '#0c2340', '#16365e',
  [('hallucigenia', 'Hallucigenia', '#ff9ab0'), ('trilobit', 'Trilobit', '#b89a6b'), ('anomalocaris', 'Anomalocaris', '#e0603a')], None),
 ('landgang', '3.2', 'Eroberung des Festlands', 'Landgang', -470e6, -400e6, '#1d2a17', '#2c4022',
  [('rhyniella', 'Springschwanz (Rhyniella)', '#d8d8a0'), ('pneumodesmus', 'Tausendfüßer (Pneumodesmus)', '#a8643c'), ('eurypterus', 'Seeskorpion (Eurypterus)', '#7a8a5a')], None),
 ('landwirbeltiere', '3.3', 'Landwirbeltiere & Samenpflanzen', 'Landwirbeltiere', -380e6, -320e6, '#1a2814', '#2a3e1f',
  [('acanthostega', 'Acanthostega', '#8ab06b'), ('pulmonoscorpius', 'Riesenskorpion (Pulmonoscorpius)', '#c08a4a'), ('arthropleura', 'Arthropleura', '#6b5a3a')],
  ('dunkleosteus', 'Dunkleosteus', '#6b7f99')),
 ('dinosaurier', '4.1', 'Amnioten, Dinosaurier & frühe Säuger', 'Dinosaurier', -320e6, -66e6, '#24261a', '#383b26',
  [('compsognathus', 'Compsognathus', '#a6c46b'), ('velociraptor', 'Velociraptor', '#c9935a'), ('triceratops', 'Triceratops', '#8a7a5a')], None),
 ('saeugetiere', '4.2', 'Säugetier-Aufstieg & Warmblütigkeit', 'Säugetier-Aufstieg', -66e6, -55e6, '#26221a', '#3b3426',
  [('purgatorius', 'Purgatorius', '#b89a7a'), ('gastornis', 'Gastornis', '#7a6b8a'), ('titanoboa', 'Titanoboa', '#5a7a4a')], None),
 ('primaten', '4.3', 'Primaten, Greifhände & Sozialität', 'Primaten', -55e6, -6e6, '#1c2a1a', '#2c4128',
  [('hyaenodon', 'Hyaenodon', '#9a8a6a'), ('entelodont', 'Entelodont', '#7a5a4a'), ('deinotherium', 'Deinotherium', '#8a8a8a')],
  ('andrewsarchus', 'Andrewsarchus', '#6a4a3a')),
 ('hominiden', '5.1', 'Aufrechter Gang & Steinwerkzeuge', 'Aufrechter Gang', -6e6, -1.8e6, '#2b2419', '#403526',
  [('pachycrocuta', 'Riesenhyäne (Pachycrocuta)', '#b0a07a'), ('dinofelis', 'Dinofelis', '#d0a04a'), ('homotherium', 'Homotherium', '#a0804a')], None),
 ('jaeger-sammler', '5.2', 'Sprache, Feuer & Jäger-Sammler-Kulturen', 'Feuer & Sprache', -1.8e6, -10000, '#2b2119', '#3f3126',
  [('hoehlenhyaene', 'Höhlenhyäne', '#a9a088'), ('hoehlenbaer', 'Höhlenbär', '#6e4a32'), ('wollnashorn', 'Wollnashorn', '#8a7660')], None),
 ('zivilisation', '5.3', 'Sesshaftigkeit, Schrift & Industrie/Digitaltechnik', 'Zivilisation', -10000, 1957, '#24231f', '#3a382f',
  [('hausratte', 'Hausratte', '#8a8378'), ('heuschrecken', 'Heuschreckenschwarm', '#b5b04a'), ('auerochse', 'Auerochse', '#5a4030')],
  ('pest', 'Schwarzer Tod (Pest)', '#7a8a5a')),
 ('erdorbit', '6.1', 'Erdorbit & unbemannte Erkundung', 'Erdorbit', 1957, 2026, '#0c0f1e', '#171c33',
  [('mikrometeoroid', 'Mikrometeoroid', '#c8c8d8'), ('weltraumschrott', 'Weltraumschrott', '#9aa0aa'), ('raketenstufe', 'Ausgebrannte Raketenstufe', '#d0d4dc')], None),
 ('mond-mars', '6.2', 'Mond, Mars & geschlossene Lebenserhaltung', 'Mond & Mars', 2026, 2055, '#1a1010', '#2e1c1a',
  [('mondstaub', 'Mondstaub', '#c8c0b0'), ('staubteufel', 'Marsstaubteufel', '#c0603a'), ('sonnensturm', 'Sonnensturm-Teilchen', '#ffd060')], None),
 ('tiefraum', '6.3', 'Interplanetare & tiefe Raumfahrt', 'Tiefe Raumfahrt', 2055, 2300, '#07071a', '#14143a',
  [('kosmische-strahlung', 'Kosmische Strahlung', '#a0e0ff'), ('kometenbrocken', 'Kometenbrocken', '#d8f0ff'), ('eisasteroid', 'Eisasteroid', '#90a8c0')],
  ('asteroid', 'Erdnaher Asteroid', '#7a6a5a')),
]

# Höhe je Stufe: Phase 1–2 kürzer (Einzeller sollen nicht ewig dauern), danach etwas länger.
# Die Jahreszahlen hängen an der Höhe – kürzere Stufen raffen nur die Zeit, die Fakten bleiben gleich.
HEIGHT_EARLY = 2000
HEIGHT_LATE = 2500

def px(v, h):
    return round(v / h, 4)

def waves(ids, early, first, h):
    # nach HÖHE: from/to/every als Anteil der Stufenhöhe (0…1). Wer stehen bleibt, bekommt keine neuen Wellen.
    # Ruhiger Aufbau: erst nur Kleine/Beute, ab 25 % Mittlere, ab 60 % Jäger. Die erste Stufe bleibt ganz ohne Jäger.
    s, m, b = ids
    f = 1.4 if early else 1.0   # Phase 1–2 lichter
    w = [
        {'enemy': s, 'from': 0, 'to': 1, 'every': px(170 if early else 260, h), 'count': 2},   # Beute/kleine Gegner
        {'enemy': s, 'from': 0.4, 'to': 1, 'every': px(160 if early else 200, h), 'count': 2},
        {'enemy': m, 'from': 0.25, 'to': 1, 'every': px(420 * f, h), 'count': 1},
        {'enemy': m, 'from': 0.6, 'to': 1, 'every': px(300 * f, h), 'count': 2},
    ]
    if not first:
        w += [
            {'enemy': b, 'from': 0.6, 'to': 1, 'every': px(700 * f, h), 'count': 1},
            {'enemy': s, 'from': 0.8, 'to': 1, 'every': px(150 * f, h), 'count': 2},
        ]
    return w

def ambient(ids, first):
    # nach ZEIT, nur wenig: ab und zu ein großer Jäger – nicht in der ersten Stufe und erst nach einer ruhigen Weile
    if first:
        return []
    return [{'enemy': ids[2], 'from': 20, 'to': 100000, 'every': 8, 'count': 1}]

# Bodentexte je Stufe: beschreiben, was in diesem Zeitraum passiert (1. am Anfang, 2. etwa in der Mitte).
# Fachlich belegbar, Zukunft ausdrücklich als solche benannt.
TEXTS = {
 'urzellen': ['Die junge Erde: heiße Meere, Vulkane, kaum Sauerstoff in der Luft. Im Wasser entstehen aus einfachen Stoffen die Bausteine des Lebens.',
              'Fettbläschen umschließen Erbmoleküle wie RNA. Aus solchen Ur-Zellen ging vermutlich das erste Leben hervor.'],
 'stoffwechsel': ['Die ersten echten Zellen: winzig und ohne Zellkern. Sie gewinnen Energie aus Wasserstoff, Schwefel oder Eisen – ganz ohne Sauerstoff.',
                  'Das Leben teilt sich in zwei große Gruppen: Bakterien und Archaeen. Mikrobenmatten bauen die ersten Stromatolithen.'],
 'photosynthese': ['Cyanobakterien nutzen Sonnenlicht und spalten dabei Wasser. Als Abfall geben sie Sauerstoff ab.',
                   'Vor ca. 2,4 Mrd. Jahren reichert sich Sauerstoff in der Luft an. Für viele Mikroben ist er giftig – wer überlebt, passt sich an.'],
 'endosymbiose': ['Eine Archaee nimmt ein Bakterium auf, ohne es zu verdauen. Daraus werden die Mitochondrien – die Kraftwerke der Zelle.',
                  'Das Erbgut bekommt eine eigene Hülle, den Zellkern. So entstehen die Eukaryoten, die Vorfahren von Pflanzen, Pilzen und Tieren.'],
 'kolonien': ['Zellen bleiben nach der Teilung zusammen und bilden Kolonien. Sie verständigen sich über Botenstoffe.',
              'Erste Mehrzeller wie Rotalgen haben schon verschiedene Zelltypen, die sich die Arbeit teilen.'],
 'mehrzeller': ['Nach der Schneeball-Erde werden Lebewesen größer: Zellen bilden Gewebe, die ersten Tiere entstehen.',
                'In der Ediacara-Zeit liegen große, weiche Lebewesen am Meeresboden. Manche hatten noch keinen Mund.'],
 'kambrium': ['In wenigen Millionen Jahren entstehen fast alle heutigen Tierstämme. Tiere bekommen Augen, Panzer und Beine.',
              'Jäger und Beute rüsten auf: Anomalocaris jagt, Trilobiten tragen Panzer. Auch die ersten Chordatiere schwimmen hier.'],
 'landgang': ['Pflanzen und Pilze besiedeln das Ufer. Die Ozonschicht hält genug UV-Strahlung ab, damit Leben an Land möglich ist.',
              'Gliederfüßer wie Tausendfüßer und Springschwänze gehen als erste Tiere an Land. Im Wasser jagen Seeskorpione.'],
 'landwirbeltiere': ['Fische mit kräftigen Flossen wagen sich ins flache Wasser. Aus ihnen werden die ersten Vierbeiner.',
                     'Riesige Sumpfwälder wachsen. Samen und Eier mit Schale machen Pflanzen und Tiere unabhängig vom Wasser.'],
 'dinosaurier': ['Reptilien und die Vorfahren der Säuger breiten sich an Land aus. Später herrschen rund 165 Mio. Jahre lang die Dinosaurier.',
                 'Die ersten Säugetiere leben im Schatten der Dinosaurier: klein, mit Fell und meist nachts aktiv.'],
 'saeugetiere': ['Ein Asteroid beendet die Zeit der Dinosaurier – nur die Vögel überleben. Säugetiere erobern die frei gewordenen Lebensräume.',
                 'Säuger sind warmblütig und halten ihre Körperwärme selbst. Bald gibt es sie in vielen neuen Formen und Größen.'],
 'primaten': ['Primaten leben in den Bäumen: Greifhände, Nägel statt Krallen und nach vorn gerichtete Augen für räumliches Sehen.',
              'Sie leben in Gruppen und lernen voneinander. Am Ende trennen sich die Linien von Schimpanse und Mensch.'],
 'hominiden': ['Vormenschen gehen aufrecht und haben die Hände frei. In der Savanne müssen sie sich vor großen Raubtieren hüten.',
               'Mit geschlagenen Steinen schneiden sie Fleisch und knacken Knochen. Die ältesten Werkzeuge sind ca. 3,3 Mio. Jahre alt.'],
 'jaeger-sammler': ['Homo erectus nutzt vermutlich schon Feuer und verlässt Afrika. Später entsteht in Afrika unsere Art, Homo sapiens.',
                    'Menschen jagen und sammeln in Gruppen, sprechen miteinander, malen in Höhlen und überstehen die Eiszeiten.'],
 'zivilisation': ['Menschen werden sesshaft: Ackerbau, Viehzucht, Dörfer und später Städte. Mit der Schrift beginnt die Geschichtsschreibung.',
                  'Maschinen, Elektrizität und Computer verändern die Welt – bis die ersten Raketen ins All fliegen.'],
 'erdorbit': ['Satelliten umkreisen die Erde, Menschen fliegen ins All und landen 1969 auf dem Mond.',
              'Raumstationen werden dauerhaft bewohnt, Sonden erkunden die Planeten. Gleichzeitig wächst der Weltraumschrott.'],
 'mond-mars': ['Zukunft: Menschen bauen Stationen auf Mond und Mars. Luft und Wasser müssen dort immer wieder aufbereitet werden.',
               'Zukunft: Dicke Wände schützen vor Strahlung und Staubstürmen. Wasser kommt aus dem Eis im Boden.'],
 'tiefraum': ['Zukunft: Raumschiffe fliegen jahrelang zu fernen Planeten – an Bord ein eigener kleiner Kreislauf aus Luft, Wasser und Nahrung.',
              'Zukunft: Selbst Licht braucht über 4 Jahre zum nächsten Stern. Eine Reise dorthin würde vermutlich Generationen dauern.'],
}

epochs = []
for i, (eid, code, name, short, f, t, bg, grid, en, boss) in enumerate(S):
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
        else:
            # Paket 2/3: Tiere, Plagen, Gefahren im All
            x['art'] = ART[xid]
            x['size'] = [22, 32, 44][j]
        enemies.append(x)
    ids = [x[0] for x in en]
    h = HEIGHT_EARLY if early else HEIGHT_LATE
    e = {'id': eid, 'code': code, 'order': i + 1, 'phase': int(code[0]), 'phaseName': PHASES[int(code[0])],
         'name': name, 'shortName': short, 'fromYear': f, 'toYear': t, 'texts': TEXTS[eid],
         'background': bg, 'gridColor': grid, 'height': h, 'enemies': enemies,
         'waves': waves(ids, early, i == 0, h), 'ambient': ambient(ids, i == 0)}
    if boss:
        e['boss'] = {'id': boss[0], 'name': boss[1], 'color': boss[2], 'size': 60, 'shape': SHAPE[boss[0]],
                     'hp': round(220 * k), 'speed': round(32 * sp), 'damage': round(14 * (1 + 0.22 * i)), 'xp': round(30 * (1 + 0.3 * i))}
        # harmlos wie in Wirklichkeit: Stromatolith steht still, Dickinsonia hatte keinen Mund
        if boss[0] == 'stromatolith': e['boss'].update(speed=0, damage=0)
        if boss[0] == 'dickinsonia': e['boss'].update(speed=6, damage=0)
        e['boss'].update(art=ART[boss[0]], size=84)
    epochs.append(e)

info = ('Stufen nach der Evolution (1.1–6.3). fromYear/toYear = Kalenderjahre (negativ = v. Chr. bzw. vor heute), '
        'innerhalb einer Stufe läuft die Zeit gleichmäßig mit der Höhe. height = Strecke bis zur Ziellinie; boss nur am Ende einer Hauptphase. '
        'waves nach HÖHE: from/to/every als Anteil der Stufenhöhe (0–1); ambient nach Zeit in Sekunden (wenig). texts = Bodentexte: beschreiben, was in der Stufe passiert (Anfang + Mitte). behavior drift = treibt, harmlos. variants (optional): erste passende Variante ändert Name/Farben/Wellen.')
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
