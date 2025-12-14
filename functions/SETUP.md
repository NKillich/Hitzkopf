# Setup-Anleitung für Firebase Cloud Functions

## WICHTIG: Was noch zu tun ist

Die Cloud Functions sind erstellt, aber **müssen noch deployed werden**, damit sie funktionieren!

## Schritt-für-Schritt Anleitung:

### 1. Firebase CLI installieren (falls noch nicht installiert)
```bash
npm install -g firebase-tools
```

### 2. Bei Firebase einloggen
```bash
firebase login
```

### 3. Firebase Projekt initialisieren
```bash
firebase init functions
```
- Wähle dein bestehendes Projekt aus (hitzkopf-f0ea6)
- Bestätige alle Vorschläge (TypeScript: Nein, ESLint: Ja)

### 4. Dependencies installieren
```bash
cd functions
npm install
```

### 5. Vollständige Fragekategorien hinzufügen

Die Datei `functions/questionCategories.js` enthält aktuell nur die Gaming-Kategorie. Du musst alle Kategorien aus `src/data/questionCategories.js` kopieren.

**Einfachste Methode:**
1. Öffne `src/data/questionCategories.js`
2. Kopiere den gesamten Inhalt
3. Ersetze `export const` durch `const` 
4. Ersetze `export function` durch `function`
5. Füge am Ende hinzu: `module.exports = { questionCategories, getAllQuestions };`
6. Speichere als `functions/questionCategories.js`

### 6. Functions deployen
```bash
cd ..
firebase deploy --only functions
```

## Nach dem Deploy:

Die Functions übernehmen automatisch:
- ✅ Auto-Advance (Game → Result) - funktioniert auch bei schlechtem Internet
- ✅ Auto-Next (Result → nächste Runde) - funktioniert auch bei schlechtem Internet  
- ✅ Execute Pending Attacks - funktioniert auch bei schlechtem Internet

## Testen:

Nach dem Deploy solltest du testen:
1. Starte ein Spiel
2. Alle Spieler beantworten Fragen
3. Das Spiel sollte automatisch zu Result wechseln (auch bei schlechtem Internet)
4. Alle Spieler klicken "Bereit"
5. Das Spiel sollte automatisch zur nächsten Runde wechseln

## Wichtig:

Die Client-seitige Logik (Auto-Advance/Auto-Next) bleibt als Fallback aktiv, aber die server-seitigen Functions haben Vorrang und sind zuverlässiger.

