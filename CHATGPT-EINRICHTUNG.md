# Fitness Tracker mit ChatGPT verbinden (V88)

Der vorhandene **Geräte-Sync bleibt Ende-zu-Ende verschlüsselt**. Für ChatGPT
gibt es daneben eine eigene, ausdrücklich aktivierbare Momentaufnahme. Sie ist
für Supabase und den von dir genehmigten ChatGPT-Client lesbar, enthält aber
keinen Namen, keine E-Mail-Adresse, keinen Standort, keine PIN und keinen
Kopplungsschlüssel.

## 1. Supabase einmalig bereitstellen

Am bequemsten geht es über den manuellen GitHub-Workflow
`Supabase fuer ChatGPT bereitstellen` unter **Actions**. Lege vorher diese
Repository-Secrets an:

- `SUPABASE_ACCESS_TOKEN`: persönliches Supabase Access Token
- `SUPABASE_DB_PASSWORD`: Datenbankpasswort des Projekts

Der Workflow wendet die Migration an und veröffentlicht die Edge Function.
Alternativ lokal:

```sh
supabase link --project-ref fbvcslmulqxaxurcdyrv
supabase db push --linked
supabase functions deploy gymtracker-mcp --no-verify-jwt
```

`--no-verify-jwt` ist hier beabsichtigt: Eine erste anonyme MCP-Anfrage muss
eine OAuth-Challenge erhalten können. Die Funktion validiert anschließend
jeden Bearer-Token über Supabase Auth; RLS beschränkt ihn auf die eigene Zeile.

## 2. Supabase Auth konfigurieren

Im Supabase Dashboard:

1. **Authentication → URL Configuration**: Site URL auf
   `https://aarontyf.github.io/Tracker` setzen.
2. **Authentication → Hooks → Custom Access Token**: Als Postgres-Funktion
   `public.tracker_ai_access_token_hook` auswählen und aktivieren. Dieser
   Schritt ist zwingend: Er bindet OAuth-Tokens an genau den Fitness-Tracker-
   MCP. Ohne den Hook verweigert der Server absichtlich jeden OAuth-Zugriff.
3. **Authentication → OAuth Server**: OAuth 2.1 aktivieren.
4. Authorization Path auf `/oauth/consent/` setzen.
5. Dynamic Client Registration aktivieren und Zustimmung für Clients
   verlangen.
6. Unter **Authentication → Providers → Email** E-Mail/Passwort aktiviert
   lassen. Für ein privates Konto ist bestätigte E-Mail empfehlenswert.

Die eigene Zustimmungsseite liegt danach unter
`https://aarontyf.github.io/Tracker/oauth/consent/`.

## 3. Freigabe in der Tracker-App einschalten

1. Tracker öffnen → **Einstellungen & Daten** → **ChatGPT-Zugriff**.
2. Mit der eigenen E-Mail-Adresse anmelden oder einmalig ein Konto anlegen.
3. **Trainingsdaten freigeben** antippen.

Ab dann wird nach lokalen Änderungen automatisch eine neue, bereinigte
Momentaufnahme hochgeladen. Der normale Geräte-Sync ist davon unabhängig.

## 4. In ChatGPT verbinden

In ChatGPT den Entwicklermodus für Plugins/Connectors öffnen und diese
Streamable-HTTP-Adresse hinzufügen:

```text
https://fbvcslmulqxaxurcdyrv.supabase.co/functions/v1/gymtracker-mcp/mcp
```

Beim Verbinden zur Supabase-Anmeldung wechseln, die angezeigte Client-App und
den Scope `email` prüfen und **Zugriff erlauben** wählen. Supabase unterstützt
derzeit nur Standard-Scopes; die eigentliche Nur-Lese-Berechtigung auf die
Trainingszeile wird deshalb unabhängig davon über `client_id` und RLS
erzwungen. Danach kann
ChatGPT unter anderem Status, Übersicht, einzelne Workouts, Übungsverläufe,
Bestleistungen und den Trainingsplan lesen. Es gibt kein Schreib-Tool.

## Zugriff beenden

In der Tracker-App **Freigabe beenden & Cloud-Kopie löschen** wählen. Damit
liefert auch ein zuvor ausgestelltes OAuth-Token keine Trainingsdaten mehr.
Unter **Autorisierte OAuth-Anwendungen** lässt sich der betreffende Zugang
zusätzlich widerrufen; dadurch werden seine Zugriffs- und Aktualisierungs-Token
ungültig. Den Connector anschließend auch in ChatGPT entfernen, wenn er dort
nicht mehr erscheinen soll.

## Sicherheitsgrenzen

- In GitHub liegen ausschließlich Quellcode und Datenbankschema, niemals ein
  persönliches Backup oder Trainingsdaten.
- MCP-Tools tragen `readOnlyHint: true`; RLS verweigert OAuth-Clients
  `INSERT`, `UPDATE` und `DELETE` unabhängig vom Toolcode.
- Automatische Aktualisierungen ändern nur eine vorhandene Freigabe. Wird die
  Cloud-Kopie auf einem Gerät gelöscht, kann ein anderes geöffnetes Gerät sie
  nicht unbemerkt neu anlegen; dafür wäre erneut eine Bestätigung nötig.
- Ein Custom-Access-Token-Hook setzt für OAuth ausschließlich die feste
  MCP-Zieladresse (`aud`) und ein Nur-Lese-Merkmal. Edge Function und RLS
  prüfen beides; ein Token für eine andere Ressource wird abgewiesen.
- Die Zustimmungsseite akzeptiert ausschließlich die von OpenAI
  dokumentierten HTTPS-Callbackpfade auf `chatgpt.com` und lädt keine fremden
  Client-Bilder nach.
- Das Supabase-OAuth-Projekt ist damit bewusst auf diesen einen MCP als
  Datenressource festgelegt. Bevor später weitere, unabhängige OAuth-APIs im
  selben Projekt hinzukommen, muss der Token-Hook auf eine Client-Allowlist
  erweitert werden.
- Der MCP-Server benutzt keinen Service-Role-Key und protokolliert weder Token
  noch Trainingsinhalte.
- Notizen innerhalb eines Workouts oder einer Übung gelten als Trainingsdaten
  und werden mitgeteilt. Sensible Freitexte dort vor der Freigabe entfernen.
