# Cees AI Studio FactuurMaker

Een eenvoudige statische factuurgenerator voor Cees AI Studio.

## GitHub Pages publiceren

1. Zet deze bestanden in de repository `ceesoddens-bit/FactuurMaker`.
2. Ga in GitHub naar `Settings` > `Pages`.
3. Kies bij `Build and deployment`:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
4. Klik `Save`.

De site staat daarna meestal op:

`https://ceesoddens-bit.github.io/FactuurMaker/`

## Bestanden

- `index.html` - de factuurgenerator
- `assets/cees-ai-studio-logo-factuur.png` - het logo
- `.nojekyll` - zorgt dat GitHub Pages de bestanden direct serveert

## Privacy

De tool bewaart ingevulde facturen alleen in de browser via `localStorage`. Klantgegevens worden niet naar een server gestuurd.
