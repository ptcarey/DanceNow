/* ============================================================
   Dance Now! — a gentle dance-along for a young child.

   Design choices (for a young child, incl. a child with CHD):
   - GENTLE by default: relaxed tempos, plenty of soft/rest beats.
   - No camera, no accounts, no internet — fully private & offline.
   - No "score" or failure. Only encouragement: stars just for joining in.
   - No reading required: every move has a big emoji.
   - Music is synthesized with the Web Audio API, so there are no
     copyrighted files and nothing to download.
   ============================================================ */

(() => {
  "use strict";

  /* ---------- Move vocabulary (gentle, low-intensity) ---------- */
  // `cls` maps to a CSS animation class on the dancer.
  const MOVES = {
    sway:   { text: "Sway",       emoji: "〰️", cls: "m-sway",   dancer: "🕺" },
    wave:   { text: "Wave!",      emoji: "👋", cls: "m-wiggle", dancer: "🙋" },
    clap:   { text: "Clap clap",  emoji: "👏", cls: "m-clap",   dancer: "👏" },
    reach:  { text: "Reach up!",  emoji: "🙌", cls: "m-reach",  dancer: "🙆" },
    bounce: { text: "Bounce",     emoji: "⤴️", cls: "m-bounce", dancer: "🧒" },
    spin:   { text: "Slow spin",  emoji: "🌀", cls: "m-spin",   dancer: "💃" },
    wiggle: { text: "Wiggle",     emoji: "🪩", cls: "m-wiggle", dancer: "🕺" },
    rest:   { text: "Soft & slow",emoji: "🫧", cls: "m-sway",   dancer: "😌" },
  };

  /* ---------- Songs ----------
     bpm = gentle tempos. `pattern` = a loop of move keys; each move
     lasts `beatsPerMove` beats. `scale` = note pool (Hz) for the melody. */
  const SONGS = [
    {
      name: "Happy Bounce",
      icon: "🌟",
      bpm: 92,
      beatsPerMove: 4,
      pattern: ["bounce", "clap", "wave", "rest"],
      scale: [392.0, 440.0, 493.9, 587.3, 659.3], // G A B D E (major pentatonic)
    },
    {
      name: "Ocean Sway",
      icon: "🌊",
      bpm: 76,
      beatsPerMove: 4,
      pattern: ["sway", "reach", "sway", "rest"],
      scale: [329.6, 392.0, 440.0, 523.3, 587.3], // calm, airy
    },
    {
      name: "Wiggle Time",
      icon: "🪩",
      bpm: 100,
      beatsPerMove: 4,
      pattern: ["wiggle", "clap", "spin", "wave"],
      scale: [440.0, 523.3, 587.3, 659.3, 783.9],
    },
    {
      name: "Sleepy Stars",
      icon: "🌙",
      bpm: 66,
      beatsPerMove: 4,
      pattern: ["rest", "reach", "sway", "rest"],
      scale: [261.6, 329.6, 392.0, 440.0, 523.3], // very calm
    },
  ];

  /* ---------- Tiny Web Audio engine ---------- */
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

  /* ---------- Game state ---------- */
  let current = null;     // current song
  let beatIndex = 0;      // global beat counter
  let stars = 0;
  let timer = null;       // setTimeout handle for the beat loop
  let nextBeatTime = 0;   // Web Audio time of the next scheduled beat
  let paused = false;

  /* ---------- Build the home menu ---------- */
  SONGS.forEach((song, i) => {
    const btn = document.createElement("button");
    btn.className = `song-card c${i}`;
    btn.innerHTML = `<span class="ico">${song.icon}</span><span>${song.name}</span>`;
    btn.addEventListener("click", () => startSong(song));
    songGrid.appendChild(btn);
  });

  function show(screen) {
    homeScreen.classList.toggle("hidden", screen !== homeScreen);
    danceScreen.classList.toggle("hidden", screen !== danceScreen);
  }

  /* ---------- Start / stop a song ---------- */
  function startSong(song) {
    Audio.init();
    Audio.resume();
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

  function stopSong() {
    if (timer) { clearTimeout(timer); timer = null; }
    dancer.className = "dancer";
    current = null;
  }

  function goHome() {
    stopSong();
    hideRest();
    show(homeScreen);
  }

  /* ---------- The beat loop ----------
     Each tick plays one beat of music, animates the dancer, and changes
     the move at move boundaries. Timing is anchored to the Web Audio
     clock (nextBeatTime) so the music never drifts, and the visual loop
     simply chases it with setTimeout. */
  function loop() {
    if (paused || !current) return;
    const beatDur = 60 / current.bpm; // seconds per beat

    playBeat(beatIndex, beatDur);
    flashBeatDot(beatIndex);

    // Change move at the start of each move-block.
    if (beatIndex % current.beatsPerMove === 0) {
      setMoveForBeat(beatIndex);
      awardStar(); // celebrate joining in, every new move
    }

    beatIndex++;
    nextBeatTime += beatDur;

    // Sleep until just before the next beat is due (Audio clock driven).
    const delayMs = Math.max(0, (nextBeatTime - Audio.ctx.currentTime) * 1000);
    timer = setTimeout(loop, delayMs);
  }

  function playBeat(i, beatDur) {
    const t = nextBeatTime;
    const inBar = i % 4;
    // Soft kick on every beat; downbeat a touch stronger.
    Audio.beat(t, inBar !== 0);
    // Sprinkle melody notes from the song's scale on most beats.
    const move = currentMove(i);
    const restful = move === MOVES.rest;
    if (!restful || inBar === 0) {
      const pool = current.scale;
      const freq = pool[(i * 2 + inBar) % pool.length];
      Audio.note(freq, t, restful ? 0.7 : 0.45, restful ? 0.35 : 0.5);
      // A gentle harmony on the downbeat.
      if (inBar === 0) Audio.note(freq * 1.5, t + 0.02, 0.5, 0.25);
    }
  }

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
    // Set the beat length CSS var so dancer animation matches the tempo.
    dancer.style.setProperty("--beat", (60 / current.bpm) + "s");
    // Force reflow so the animation restarts cleanly on move change.
    void dancer.offsetWidth;
    dancer.classList.add(move.cls);
  }

  function flashBeatDot(i) {
    const pos = i % beatDots.length;
    beatDots.forEach((d, n) => d.classList.toggle("on", n === pos));
  }

  /* ---------- Rewards ---------- */
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

  /* ---------- Rest (gentle break) ---------- */
  function showRest() {
    paused = true;
    if (timer) { clearTimeout(timer); timer = null; }
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
    // Re-anchor the audio clock to "now" so we pick up cleanly.
    nextBeatTime = Audio.ctx.currentTime + 0.05;
    loop();
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
