// Sounds and music: our own, synthesized by tools/gen_sounds.py (event mapping and volumes follow BallMerge3D).
// Web Audio: clips are decoded once and played with no latency. Browsers only allow audio
// after a user gesture, so the context is unlocked on the first tap.

const SOUNDS = {
  button: { file: 'button', volume: 1 },
  carAdd: { file: 'car_add', volume: 0.5 },
  merge: { file: 'merge', volume: 0.5 },
  gateAdd: { file: 'gate_add', volume: 0.45 },
  trackUpgrade: { file: 'track_upgrade', volume: 0.6 },
  goalComplete: { file: 'goal_complete', volume: 0.5 },
  stageComplete: { file: 'stage_complete', volume: 0.6 },
  popup: { file: 'popup', volume: 0.75 },
  reward: { file: ['reward_1', 'reward_2'], volume: 1, pitch: [1, 1.05], cooldown: 0.25 },
  coinScatter: { file: 'coin_scatter', volume: 0.8 },
  coinFly: { file: 'coin_fly', volume: 0.15 },
  coinCollect: { file: 'coin_collect', volume: 0.15, cooldown: 0.08 },
};
const MUSIC_VOLUME = 0.1;
const PREFS_KEY = 'idle-train-audio';

export class Audio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain.connect(this.ctx.destination);
    this.musicGain.connect(this.ctx.destination);
    this.buffers = new Map();
    this.lastPlayed = {};
    this.music = null;

    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      /* defaults */
    }
    this.soundOn = prefs.sound ?? true;
    this.musicOn = prefs.music ?? true;
    this.applyVolumes();

    const files = new Set(['music']);
    for (const s of Object.values(SOUNDS)) [].concat(s.file).forEach((f) => files.add(f));
    for (const f of files) this.load(f);

    // Resume on every gesture: some browsers (iOS Safari) suspend the context on their own.
    this.gestured = false;
    const unlock = () => {
      this.gestured = true;
      if (!document.hidden) this.ctx.resume().then(() => this.startMusic());
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    // Pause everything while the tab is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx.suspend();
      else if (this.gestured) this.ctx.resume();
    });
  }

  async load(name) {
    try {
      const res = await fetch(`assets/audio/${name}.m4a`);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
      if (name === 'music') this.startMusic();
    } catch (err) {
      console.warn(`Sound ${name} failed to load`, err);
    }
  }

  get unlocked() {
    return this.ctx.state === 'running';
  }

  play(id) {
    const s = SOUNDS[id];
    if (!s || !this.soundOn || !this.unlocked) return;
    const now = this.ctx.currentTime;
    if (s.cooldown && now - (this.lastPlayed[id] ?? -1) < s.cooldown) return;
    const files = [].concat(s.file);
    const buf = this.buffers.get(files[Math.floor(Math.random() * files.length)]);
    if (!buf) return;
    this.lastPlayed[id] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (s.pitch) src.playbackRate.value = s.pitch[0] + Math.random() * (s.pitch[1] - s.pitch[0]);
    const gain = this.ctx.createGain();
    gain.gain.value = s.volume;
    src.connect(gain).connect(this.sfxGain);
    src.start();
  }

  startMusic() {
    const buf = this.buffers.get('music');
    if (this.music || !buf || !this.unlocked) return;
    this.music = this.ctx.createBufferSource();
    this.music.buffer = buf;
    this.music.loop = true;
    this.music.connect(this.musicGain);
    this.music.start();
  }

  setSound(on) {
    this.soundOn = on;
    this.savePrefs();
  }

  setMusic(on) {
    this.musicOn = on;
    this.applyVolumes();
    this.savePrefs();
  }

  applyVolumes() {
    this.musicGain.gain.value = this.musicOn ? MUSIC_VOLUME : 0;
  }

  savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sound: this.soundOn, music: this.musicOn }));
    } catch {
      /* ignore */
    }
  }
}
