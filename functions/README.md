# Firebase Cloud Functions für Hitzkopf

Diese Cloud Functions übernehmen die Host-Logik server-seitig, um das Spiel auch bei schlechtem Internet stabil zu machen.

## Setup

1. Installiere Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login bei Firebase:
```bash
firebase login
```

3. Initialisiere das Projekt (falls noch nicht geschehen):
```bash
firebase init functions
```

4. Installiere Dependencies:
```bash
cd functions
npm install
```

5. Deploy die Functions:
```bash
firebase deploy --only functions
```

## Funktionen

### onAllVotesReceived
- **Trigger**: Firestore Update auf `lobbies/{lobbyId}`
- **Funktion**: Wechselt automatisch von `game` zu `result`, wenn alle Spieler geantwortet haben
- **Vorteil**: Funktioniert auch wenn der Host schlechtes Internet hat

### onAllReady
- **Trigger**: Firestore Update auf `lobbies/{lobbyId}`
- **Funktion**: Startet automatisch die nächste Runde, wenn alle Spieler bereit sind
- **Vorteil**: Keine Abhängigkeit von der Host-Verbindung

### onAllAttackDecisionsMade
- **Trigger**: Firestore Update auf `lobbies/{lobbyId}`
- **Funktion**: Verarbeitet Angriffe automatisch, wenn alle Entscheidungen getroffen wurden
- **Vorteil**: Synchronisation funktioniert zuverlässig

## Wichtig

Die Cloud Functions benötigen Zugriff auf die Fragekategorien. Aktuell ist eine vereinfachte Version implementiert. Für die vollständige Funktionalität sollten:

1. Die Fragen in Firestore gespeichert werden, ODER
2. Die vollständigen Fragekategorien in die Functions kopiert werden

## Client-Anpassungen

Nach dem Deploy der Functions sollten die Auto-Advance und Auto-Next Logik im Client entfernt werden, da diese jetzt server-seitig läuft.

