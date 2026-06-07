# Dance Now! 💃

A simple, gentle **dance-along app for a young child**. Pick a song, follow the
friendly dancer and the big move prompts, and collect sparkly stars just for
joining in.

Designed to be safe and kind for little ones — including a child with a heart
condition (CHD):

- **Gentle by design** — relaxed tempos, lots of soft "rest" beats, and a big
  **💜 Rest** button that pauses everything with a calm breathing prompt.
- **No pressure** — there is no score and no way to "lose". Stars are given just
  for taking part.
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
| 🌟 Happy Bounce | upbeat, bouncy | medium |
| 🌊 Ocean Sway | calm, swaying | slow |
| 🪩 Wiggle Time | playful | livelier |
| 🌙 Sleepy Stars | very calm wind-down | slowest |

## Files

- `index.html` — screens, styles, and the dancer/move UI
- `app.js` — move/song data, the Web Audio music engine, the beat loop, stars & rest
- `manifest.webmanifest`, `icon.svg`, `sw.js` — make it installable & offline

## Customising

- **Add a song:** add an entry to `SONGS` in `app.js` (name, icon, `bpm`,
  `beatsPerMove`, a `pattern` of move keys, and a `scale` of note frequencies).
- **Add a move:** add an entry to `MOVES` with `text`, `emoji`, a dancer emoji,
  and a CSS animation class (`cls`) — see the `@keyframes` in `index.html`.
- **Make it gentler/livelier:** lower/raise the `bpm` values and use more `rest`
  beats in a song's `pattern`.
