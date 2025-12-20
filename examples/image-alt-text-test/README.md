# Image Alt Text Test Example

Purpose: zeigt, wie `next/image` Alt-Texte automatisch generiert, wenn **kein** `alt`-Prop gesetzt wird.

## Starten

```bash
pnpm install          # im Repo-Root, Workspaces verlinken
pnpm --filter with-image-alt-text dev
# danach http://localhost:3000 öffnen
```

## Was passiert

- Bilder haben absichtlich kein `alt`-Attribut.
- Alt-Text wird aus dem Dateinamen/Seed der URL abgeleitet.

## Anpassen

- Weitere Bilder/Seeds im Array `images` in `app/page.tsx` ergänzen.
- Kein `alt`-Prop setzen, damit die Auto-Generierung greift.
