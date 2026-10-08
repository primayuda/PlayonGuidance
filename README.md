# Playon Guidance

Live site: https://primayuda.github.io/PlayonGuidance/

A support-crew map of hospitals, clinics, and emergency rooms along the ITB Ultra Marathon 2026 route, from Jakarta to Bandung, for Playon 85.

The race is 16–18 October 2026. The site opens in Indonesian. Switch to English with **EN** in the header.

## Full screen

![Playon Guidance on a full desktop window, with the hospital list and the route map](docs/desktop.png)

## Mobile

![Playon Guidance on a phone, with the map above the hospital list](docs/mobile.png)

## Open it

There is no build step. To preview it on this computer, run this in the folder and open http://localhost:8000:

```sh
python3 -m http.server 8000
```

Opening `index.html` straight from the file leaves the base map blank, because OpenStreetMap refuses tiles to a page with no web address. The map tiles also need a network connection.

- Search by name, place, or phone.
- Filter for a major emergency room, places open overnight, places on the road, or detours.
- Jump to a section of the route: Jakarta–Bogor, Bogor–Cianjur, Cianjur–Padalarang, or Padalarang–Bandung.
- Call a listed number, or open directions.
- **Terdekat** finds the nearest place from your location.
- **Ambulans 119** stays in the header.

The orange line is the ITB Ultra Marathon 2026 route from the [race map](https://www.google.com/maps/d/viewer?mid=18xsq7cKCM6lcQOvMwXg0qjceXzdH4_o), about 178 km. Hollow pins are approximate and should be confirmed before race day. Phones and hours come from the Playon crew notes.
