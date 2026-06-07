# Dance Now! 💃

A fun, **energetic dance-along app for a young child**. Pick a song, copy the
friendly dancer's big moves — jump, spin, stomp, clap — and collect sparkly
stars for joining in!

Made to be easy and joyful for little ones:

- **High-energy & playful** — upbeat tempos and big, bouncy moves, with a
  rainbow "Cool Down" song when it's time to wind down.
- **🎵 Dance to your own music** — a grown-up can tap **Your Song** and pick an
  audio file from the device. The app listens for the beat and the moves dance
  in time with the real song. The file stays on the device — nothing is uploaded.
- **No pressure** — there is no score and no way to "lose". Stars are given just
  for taking part, and there's a big **⏸️ Pause** button any time.
- **No reading needed** — every move is shown with a big emoji.
- **Private & offline** — no camera, no accounts, no internet. Built-in music is
  made on the device, and your own songs never leave the phone.

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

**On an iPhone/iPad (iOS):**

1. Open the app's URL in **Safari** (it must be Safari to install — see GitHub
   Pages below for a permanent link).
2. Tap the **Share** button → **Add to Home Screen**. It opens like a real app
   (standalone, its own star icon) and works offline after the first load.
3. Tap a song to start — and check the **side mute switch isn't on** and the
   volume is up. (Your own songs via *Your Song* are routed so they still play
   even with the mute switch on; the file picker reads from the **Files** app.)

> Audio starts when you tap a song (browsers require a tap before playing sound).

### Putting it on the tablet for good (GitHub Pages)

For a permanent link you can "Add to Home screen" (full-screen + offline), turn
on GitHub Pages — **one Settings toggle, then it auto-updates on every push**
(no workflow needed):

1. GitHub → repo **Settings → Pages**.
2. **Build and deployment → Source: _Deploy from a branch_.**
3. Branch: **`claude/fervent-gauss-jZYNt`** · folder **`/ (root)`** → **Save**.
4. Wait ~1 minute, then open:
   > **https://ptcarey.github.io/DanceNow/**
5. On the tablet in Chrome → **⋮ → Add to Home screen**. Done.

> **Note:** this repo is now **public**, so GitHub Pages is free. The same link
> works for both Android (Chrome) and iOS (Safari) — just "Add to Home Screen".

**Other ways to host it (if you prefer):**

- **Make the repo public** (Settings → General → Danger Zone), then do the steps
  above — Pages is free for public repos.
- **Netlify Drop** — go to <https://app.netlify.com/drop> and drag this folder
  in. Instant public HTTPS link, no account needed.
- **Local Wi-Fi** — `python3 -m http.server 8000` here, then open
  `http://<your-computer-ip>:8000` on the tablet (computer must stay on).

## Built-in songs

| Song | Feel | Tempo |
|------|------|-------|
| 🦘 Jump Around | bouncy & high-energy | fast |
| 🪩 Disco Party | playful & funky | fast |
| 🌟 Super Star | big, exciting moves | fast |
| 🌈 Cool Down | gentler wind-down | medium |
| 🪄 Abracadabra | sparkly, spell-casting | fast (136 BPM) |

…plus **🎵 Your Song** — pick any audio file and the moves sync to its beat.

> **About "Abracadabra":** this is an *original* synthesized track the app plays
> itself, inspired by and tuned to Lady Gaga's song (136 BPM, F minor) so it
> feels right — it is **not** the copyrighted recording. To dance to the actual
> Lady Gaga track, tap **🎵 Your Song** and pick your own audio file; it stays on
> the device.

## How "Your Song" works

When you pick a file, the app:
1. Decodes the audio with the Web Audio API (entirely on-device).
2. Band-passes it around the low end (the kick drum) and finds the loudest
   peak in each half-second.
3. Looks at the gaps between those peaks and picks the most common tempo (BPM).
4. Plays the song and changes the dance move on that beat grid.

It's an approximate beat detector — perfect sync isn't the goal, just
"dancing in time" so it feels right. No libraries, no network.

## Files

- `index.html` — screens, styles, and the dancer/move UI
- `app.js` — songs/moves, the Web Audio music engine, beat detection, the beat
  loop, stars, pause, and the "Your Song" file flow
- `manifest.webmanifest`, `icon.svg`, `app-icon-*.png`, `sw.js` — make it
  installable & offline on Android **and** iOS (iOS needs the PNG icons)
- `tools/gen-icons.mjs` — regenerates the PNG icons (`node tools/gen-icons.mjs`),
  dependency-free

## Customising

- **Add a song:** add an entry to `SONGS` in `app.js` (name, icon, `bpm`,
  `beatsPerMove`, a `pattern` of move keys, and a `scale` of note frequencies).
- **Add a move:** add an entry to `MOVES` with `text`, `emoji`, a dancer emoji,
  and a CSS animation class (`cls`) — see the `@keyframes` in `index.html`.
- **Make it livelier/gentler:** raise/lower the `bpm` values and choose bigger
  or softer moves in a song's `pattern`.
