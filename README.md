# Bildkonverterare

Det här är ett litet program jag har gjort. Det gör om bilder från ett format till ett annat.
Till exempel PNG till JPG, eller JPG till WebP.

Man kan använda det på två sätt:

- **I webbläsaren.** Man drar in bilder på en sida och trycker på en knapp.
- **I terminalen.** Man skriver ett kommando. Bra om man har många bilder.

Allt sker på min egen dator. Ingen bild skickas till internet.

## Jag använder ett bibliotek

Ett bibliotek är kod som någon annan redan har skrivit. Man laddar ner den och använder den.
Sharp kan öppna en bild och spara den i ett annat format. Den kan också ändra storlek.

## Installera

Du behöver Node.js. Sedan skriver du:

```sh
npm install
```

Då laddas sharp ner. Det tar en liten stund första gången.

## Kör i webbläsaren

```sh
npm start
```

Normalt kan bara min egen dator nå sidan. Max 64 MB per bild.

## Kör i terminalen

```sh
node convert.js <filer> --to <format>
```

Exempel:

```sh
node convert.js photo.png --to jpeg
node convert.js ./bilder --to webp -q 90 -o ./klara
node convert.js clip.webp --to gif -w 480
node convert.js ./foton --to avif --recursive --overwrite -o ./out
```

Du kan skriva filnamn eller en hel mapp. Skriver du en mapp så tar den alla bilder i den.

