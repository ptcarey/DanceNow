/* ============================================================
   Dance Now! — a fun dance-along for a young child.

   Design choices:
   - High-energy & playful: bouncy moves, upbeat tempos.
   - No camera, no accounts, no login — private and (once loaded) offline.
   - No "score" or failure. Only encouragement: stars just for joining in.
   - No reading required: every move has a big emoji.
   - Two ways to play:
       1. Tap a built-in song — music is synthesized on-device with the
          Web Audio API (no files, instant, always works).
       2. "Your Song" — a grown-up picks an audio file from the device; the
          app detects its beat and the dance moves lock to the real song.
          The file stays on the device; nothing is uploaded.
   ============================================================ */

(() => {
  "use strict";

  /* ---------- Move vocabulary ---------- */
  // `cls` maps to a CSS animation class on the dancer.
  const MOVES = {
    jump:   { text: "Jump!",       emoji: "🦘", cls: "m-jump",   dancer: "🤸" },
    spin:   { text: "Spin!",       emoji: "🌀", cls: "m-twirl",  dancer: "💃" },
    clap:   { text: "Clap clap!",  emoji: "👏", cls: "m-clap",   dancer: "🙌" },
    stomp:  { text: "Stomp!",      emoji: "👣", cls: "m-stomp",  dancer: "🕺" },
    wave:   { text: "Big wave!",   emoji: "👋", cls: "m-wiggle", dancer: "🙋" },
    wiggle: { text: "Wiggle!",     emoji: "🪩", cls: "m-wiggle", dancer: "🕺" },
    reach:  { text: "Reach high!", emoji: "🙌", cls: "m-reach",  dancer: "🙆" },
    bounce: { text: "Bounce!",     emoji: "⤴️", cls: "m-bounce", dancer: "💃" },
    sway:   { text: "Sway",        emoji: "〰️", cls: "m-sway",   dancer: "🕺" },
  };

  // A varied move rotation used for player-supplied songs.
  const FILE_PATTERN = ["jump", "clap", "spin", "stomp", "wiggle", "reach", "wave", "bounce"];

  /* ---------- Built-in songs ----------
     `pattern` = a loop of move keys; each move lasts `beatsPerMove` beats.
     `scale` = note pool (Hz) for the synthesized melody. */
  const SONGS = [
    {
      name: "Jump Around",
      icon: "🦘",
      bpm: 128,
      beatsPerMove: 4,
      pattern: ["jump", "clap", "spin", "stomp"],
      scale: [392.0, 440.0, 493.9, 587.3, 659.3], // bright major pentatonic
    },
    {
      name: "Disco Party",
      icon: "🪩",
      bpm: 120,
      beatsPerMove: 4,
      pattern: ["wiggle", "spin", "clap", "jump"],
      scale: [440.0, 523.3, 587.3, 659.3, 783.9],
    },
    {
      name: "Super Star",
      icon: "🌟",
      bpm: 124,
      beatsPerMove: 4,
      pattern: ["reach", "bounce", "wave", "spin"],
      scale: [523.3, 587.3, 659.3, 783.9, 880.0], // high & exciting
    },
    {
      name: "Cool Down",
      icon: "🌈",
      bpm: 90,
      beatsPerMove: 4,
      pattern: ["sway", "reach", "wave", "bounce"],
      scale: [329.6, 392.0, 440.0, 523.3, 587.3], // a gentler wind-down
    },
  ];

  /* ---------- Tiny Web Audio engine (for built-in songs + sparkles) ---------- */
  const Audio = {
    ctx: null,
    master: null,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32; // soft overall volume
      this.master.connect(this.ctx.destination);
    },
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },

    // A soft, bell-ish note.
    note(freq, when, dur = 0.45, gain = 0.5) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(gain, when + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g).connect(this.master);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    },

    // A gentle, muffled kick for the beat.
    beat(when, soft = false) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(soft ? 150 : 190, when);
      osc.frequency.exponentialRampToValueAtTime(60, when + 0.12);
      g.gain.setValueAtTime(soft ? 0.18 : 0.32, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      osc.connect(g).connect(this.master);
      osc.start(when);
      osc.stop(when + 0.2);
    },

    // Happy little sparkle for rewards.
    sparkle() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [880, 1174, 1568].forEach((f, i) => this.note(f, t + i * 0.07, 0.3, 0.35));
    },
  };

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const homeScreen = $("homeScreen");
  const danceScreen = $("danceScreen");
  const songGrid = $("songGrid");
  const dancer = $("dancer");
  const moveText = $("moveText");
  const moveEmoji = $("moveEmoji");
  const songName = $("songName");
  const starCountEl = $("starCount");
  const beatDots = Array.from(document.querySelectorAll(".beat-dot"));
  const restOverlay = $("restOverlay");
  const toastEl = $("toast");

  /* ---------- Game state ---------- */
  let current = null;     // current song (built-in or file)
  let beatIndex = 0;      // global beat counter (synth songs)
  let stars = 0;
  let timer = null;       // setTimeout handle for the synth beat loop
  let nextBeatTime = 0;   // Web Audio time of the next scheduled synth beat
  let paused = false;

  // File-song playback state
  let audioEl = null;     // <audio> element that plays the chosen file
  let objectUrl = null;   // object URL for the chosen file
  let rafId = null;       // requestAnimationFrame handle for the file loop
  let lastFileBeat = -1;  // last beat index handled in file mode

  /* ---------- Build the home menu ---------- */
  SONGS.forEach((song, i) => {
    const btn = document.createElement("button");
    btn.className = `song-card c${i}`;
    btn.innerHTML = `<span class="ico">${song.icon}</span><span>${song.name}</span>`;
    btn.addEventListener("click", () => startSong(song));
    songGrid.appendChild(btn);
  });

  // Hidden file picker + a full-width "Your Song" card.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    fileInput.value = ""; // allow re-picking the same file later
    if (f) startFileSong(f);
  });

  const addCard = document.createElement("button");
  addCard.className = "song-card add-card";
  addCard.innerHTML = `<span class="ico">🎵</span><span>Your Song</span>`;
  addCard.addEventListener("click", () => fileInput.click());
  songGrid.appendChild(addCard);

  function show(screen) {
    homeScreen.classList.toggle("hidden", screen !== homeScreen);
    danceScreen.classList.toggle("hidden", screen !== danceScreen);
  }

  /* ============================================================
     BUILT-IN SONGS (synthesized music + beat loop)
     ============================================================ */
  function startSong(song) {
    Audio.init();
    Audio.resume();
    stopSong();           // clear any previous song first
    current = song;
    beatIndex = 0;
    paused = false;
    songName.textContent = song.name;
    show(danceScreen);
    setMoveForBeat(0);
    // Schedule first beat a hair in the future so audio is clean.
    nextBeatTime = Audio.ctx.currentTime + 0.1;
    loop();
  }

  // The synth beat loop: timing is anchored to the Web Audio clock
  // (nextBeatTime) so the music never drifts; the visual loop chases it.
  function loop() {
    if (paused || !current || current.isFile) return;
    const beatDur = 60 / current.bpm; // seconds per beat

    playBeat(beatIndex, beatDur);
    flashBeatDot(beatIndex);

    if (beatIndex % current.beatsPerMove === 0) {
      setMoveForBeat(beatIndex);
      awardStar(); // celebrate joining in, every new move
    }

    beatIndex++;
    nextBeatTime += beatDur;

    const delayMs = Math.max(0, (nextBeatTime - Audio.ctx.currentTime) * 1000);
    timer = setTimeout(loop, delayMs);
  }

  function playBeat(i, beatDur) {
    const t = nextBeatTime;
    const inBar = i % 4;
    Audio.beat(t, inBar !== 0); // soft kick; downbeat a touch stronger
    const pool = current.scale;
    const freq = pool[(i * 2 + inBar) % pool.length];
    Audio.note(freq, t, 0.4, 0.5);
    if (inBar === 0) Audio.note(freq * 1.5, t + 0.02, 0.45, 0.28); // downbeat harmony
    Audio.note(freq * 2, t + beatDur / 2, 0.18, 0.18);            // off-beat bounce
  }

  /* ============================================================
     "YOUR SONG" (player-supplied file + beat detection)
     ============================================================ */
  function getAudioEl() {
    if (!audioEl) {
      // NOTE: `Audio` is our engine object above, so we must NOT use
      // `new Audio()` here — create the element explicitly.
      audioEl = document.createElement("audio");
      audioEl.addEventListener("ended", goHome);
      document.body.appendChild(audioEl);
    }
    return audioEl;
  }

  async function startFileSong(file) {
    try {
      Audio.init();
      Audio.resume();
      stopSong();

      // Start playback FIRST, while we still have the user's tap "activation".
      // Beat detection can take a moment, and on a phone that delay could push
      // play() past the activation window and get the audio blocked.
      const el = getAudioEl();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      el.src = objectUrl;

      current = {
        name: prettyName(file.name),
        bpm: 120,            // provisional tempo until detection refines it
        beatsPerMove: 4,
        pattern: FILE_PATTERN,
        isFile: true,
      };
      paused = false;
      lastFileBeat = -1;
      songName.textContent = current.name;
      show(danceScreen);
      setMoveForBeat(0);

      await el.play();       // music starts right away
      fileLoop();            // dance at the provisional tempo immediately

      // Refine the tempo in the background and update the pace when ready.
      file.arrayBuffer()
        .then((buf) => Audio.ctx.decodeAudioData(buf))
        .then((audioBuf) => detectBpm(audioBuf))
        .then((bpm) => { if (current && current.isFile) current.bpm = bpm; })
        .catch((e) => console.warn("Tempo detection failed, keeping 120 BPM:", e));
    } catch (err) {
      console.warn("Could not load song:", err);
      showToast("Hmm, couldn't play that song. Try another! 🎵", 2600);
      current = null;
      show(homeScreen);
    }
  }

  // Drive moves from the real song's playback position, so they stay in
  // sync through pauses and seeks automatically.
  function fileLoop() {
    if (paused || !current || !current.isFile || !audioEl) return;
    const beatDur = 60 / current.bpm;
    const beat = Math.floor(audioEl.currentTime / beatDur);
    if (beat >= 0 && beat !== lastFileBeat) {
      lastFileBeat = beat;
      flashBeatDot(beat);
      if (beat % current.beatsPerMove === 0) {
        setMoveForBeat(beat);
        awardStar();
      }
    }
    rafId = requestAnimationFrame(fileLoop);
  }

  /* ---------- Beat detection (dependency-free) ----------
     Band-pass the track around the low end (kick drum), find the loudest
     peak in each half-second, then look at the gaps between peaks and pick
     the most common tempo. Approximate, but plenty good for dancing. */
  async function detectBpm(buffer) {
    try {
      const sr = buffer.sampleRate;
      const len = Math.min(buffer.length, Math.floor(sr * 60)); // analyze up to 60s
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offline = new OfflineCtx(1, len, sr);

      const src = offline.createBufferSource();
      src.buffer = buffer;
      const lp = offline.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 150;
      const hp = offline.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 90;
      src.connect(lp); lp.connect(hp); hp.connect(offline.destination);
      src.start(0);

      const rendered = await offline.startRendering();
      const data = rendered.getChannelData(0);
      const peaks = getPeaks(data, sr);
      const bpm = tempoFromPeaks(peaks, sr);
      return clampTempo(bpm);
    } catch (err) {
      console.warn("Beat detection failed, using default tempo:", err);
      return 120;
    }
  }

  function getPeaks(data, sr) {
    const partSize = Math.floor(sr / 2); // half-second windows
    const parts = Math.floor(data.length / partSize);
    let peaks = [];
    for (let i = 0; i < parts; i++) {
      let max = 0, pos = i * partSize;
      const end = (i + 1) * partSize;
      for (let j = i * partSize; j < end; j++) {
        const v = Math.abs(data[j]);
        if (v > max) { max = v; pos = j; }
      }
      peaks.push({ pos, vol: max });
    }
    // Keep the louder peaks to cut noise, then restore time order.
    peaks.sort((a, b) => b.vol - a.vol);
    peaks = peaks.slice(0, Math.max(4, Math.ceil(peaks.length * 0.6)));
    peaks.sort((a, b) => a.pos - b.pos);
    return peaks;
  }

  function tempoFromPeaks(peaks, sr) {
    const groups = [];
    for (let i = 0; i < peaks.length; i++) {
      for (let j = 1; j <= 10 && i + j < peaks.length; j++) {
        const interval = peaks[i + j].pos - peaks[i].pos;
        if (interval <= 0) continue;
        let bpm = 60 / (interval / sr);
        while (bpm < 80) bpm *= 2;
        while (bpm > 180) bpm /= 2;
        const rounded = Math.round(bpm);
        const g = groups.find((x) => x.bpm === rounded);
        if (g) g.count++;
        else groups.push({ bpm: rounded, count: 1 });
      }
    }
    if (!groups.length) return 120;
    groups.sort((a, b) => b.count - a.count);
    return groups[0].bpm;
  }

  // Keep the move pace danceable for a small child.
  function clampTempo(bpm) {
    if (!isFinite(bpm) || bpm <= 0) return 120;
    while (bpm > 160) bpm /= 2;
    while (bpm < 80) bpm *= 2;
    return Math.round(bpm);
  }

  function prettyName(filename) {
    let n = String(filename).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (n.length > 22) n = n.slice(0, 22) + "…";
    return n || "Your Song";
  }

  /* ============================================================
     SHARED: moves, beat dots, rewards, stop, pause/resume
     ============================================================ */
  function currentMove(i) {
    const blocks = current.pattern;
    const idx = Math.floor(i / current.beatsPerMove) % blocks.length;
    return MOVES[blocks[idx]];
  }

  function setMoveForBeat(i) {
    const move = currentMove(i);
    moveText.textContent = move.text;
    moveEmoji.textContent = move.emoji;
    dancer.textContent = move.dancer;
    dancer.className = "dancer"; // reset
    dancer.style.setProperty("--beat", (60 / current.bpm) + "s");
    void dancer.offsetWidth; // force reflow so the animation restarts cleanly
    dancer.classList.add(move.cls);
  }

  function flashBeatDot(i) {
    const pos = ((i % beatDots.length) + beatDots.length) % beatDots.length;
    beatDots.forEach((d, n) => d.classList.toggle("on", n === pos));
  }

  function awardStar() {
    stars++;
    starCountEl.textContent = stars;
    Audio.sparkle();
    burstStars();
  }

  function burstStars() {
    const emojis = ["⭐", "🌟", "✨", "💫", "🌈", "💖"];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let n = 0; n < 7; n++) {
      const s = document.createElement("div");
      s.className = "star";
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 120;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      s.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      s.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  }

  function stopSong() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (audioEl) {
      audioEl.pause();
      try { audioEl.currentTime = 0; } catch (e) { /* ignore */ }
    }
    dancer.className = "dancer";
    current = null;
  }

  function goHome() {
    stopSong();
    hideRest();
    show(homeScreen);
  }

  /* ---------- Pause / resume ---------- */
  function showRest() {
    if (!current) return;
    paused = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (current.isFile && audioEl) audioEl.pause();
    dancer.style.animationPlayState = "paused";
    restOverlay.classList.remove("hidden");
  }
  function hideRest() {
    restOverlay.classList.add("hidden");
    dancer.style.animationPlayState = "";
  }
  function resumeFromRest() {
    hideRest();
    if (!current) return;
    paused = false;
    dancer.style.animationPlayState = "";
    if (current.isFile && audioEl) {
      audioEl.play().catch(() => {});
      fileLoop();
    } else {
      nextBeatTime = Audio.ctx.currentTime + 0.05; // re-anchor cleanly
      loop();
    }
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function showToast(msg, hideAfter) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (hideAfter) toastTimer = setTimeout(hideToast, hideAfter);
  }
  function hideToast() {
    if (toastEl) toastEl.classList.add("hidden");
  }

  /* ---------- Wire up controls ---------- */
  $("homeBtn").addEventListener("click", goHome);
  $("restBtn").addEventListener("click", showRest);
  $("resumeBtn").addEventListener("click", resumeFromRest);

  // Keep audio alive if the tab is backgrounded then returns.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) Audio.resume();
  });

  /* ---------- Offline support ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("sw.js").catch(() => {})
    );
  }
})();
