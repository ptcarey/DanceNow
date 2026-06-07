# Dance Now! 💃

A fun, **energetic dance-along app for a young child**. Pick a song, copy the
friendly dancer's big moves — jump, spin, stomp, clap — and collect sparkly
stars for joining in!

Made to be easy and joyful for little ones:

- **High-energy & playful** — upbeat tempos and big, bouncy moves, with a
  rainbow "Cool Down" song when it's time to wind down.
- **No pressure** — there is no score and no way to "lose". Stars are given just
  for taking part, and there's a big **⏸️ Pause** button any time.
- **No reading needed** — every move is shown with a big emoji.
- **Private & offline** — no camera, no accounts, no internet. Music is made
  on the device, so there are no files to download and nothing leaves the phone.

## How to run it

It's a single self-contained web app — no build step.

**Quickest:** open `index.html` in any modern browser.

**On an Android phone/tablet (like a real app):**

1. Serve the folder over HTTP, e.g. from this directory:
   ```bash
   python3 -m http.server 8000
   ```
2. On the device (same Wi-Fi), open `http://<your-computer-ip>:8000`.
3. In Chrome, tap the menu → **Add to Home screen**. It installs full-screen
   and works offline after the first load.

> Audio starts when you tap a song (browsers require a tap before playing sound).

## Songs

| Song | Feel | Tempo |
|------|------|-------|
| 🦘 Jump Around | bouncy & high-energy | fast |
| 🪩 Disco Party | playful & funky | fast |
| 🌟 Super Star | big, exciting moves | fast |
| 🌈 Cool Down | gentler wind-down | medium |

## Files

- `index.html` — screens, styles, and the dancer/move UI
- `app.js` — move/song data, the Web Audio music engine, the beat loop, stars & rest
- `manifest.webmanifest`, `icon.svg`, `sw.js` — make it installable & offline

## Customising

- **Add a song:** add an entry to `SONGS` in `app.js` (name, icon, `bpm`,
  `beatsPerMove`, a `pattern` of move keys, and a `scale` of note frequencies).
- **Add a move:** add an entry to `MOVES` with `text`, `emoji`, a dancer emoji,
  and a CSS animation class (`cls`) — see the `@keyframes` in `index.html`.
- **Make it livelier/gentler:** raise/lower the `bpm` values and choose bigger
  or softer moves in a song's `pattern`.
