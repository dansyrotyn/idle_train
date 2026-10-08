import { formatCoins, formatCompact, formatPrice, formatRate } from '../utils/format.js';
import { ARROW_RIGHT_SVG, ARROW_UP_SVG, CLOSE_SVG, COIN_SVG, GEAR_SVG, PLUS_SVG } from './svg.js';

const TUTORIAL_TEXT = {
  add: 'TAP TO ADD A CAR',
  merge: 'MERGE TWO CARS',
  gate: 'ADD A REWARD LINE',
  track: 'UPGRADE THE TRACK',
};

const TEMPLATE = /* html */ `
<div class="hud">
  <div class="top">
    <button class="btn-gear" data-id="gear" aria-label="Settings">${GEAR_SVG}</button>
    <div class="stage-pill">
      <div class="stage-title">STAGE: <span data-id="stage">1</span></div>
      <div class="stage-goal">Goal: <span data-id="goalnum">1/3</span></div>
    </div>
    <div class="coins">
      <div class="coins-box" data-id="coins-box"><span class="coin-icon" data-id="coin-icon">${COIN_SVG}</span><span data-id="coins">0</span></div>
      <div class="rate"><span data-id="rate">0</span>/sec</div>
    </div>
  </div>
  <div class="fps" data-id="fps" hidden></div>
  <div class="toast" data-id="toast"></div>
  <div class="bottom">
    <div class="goal-card">
      <div class="goal-text" data-id="goal-text"></div>
      <div class="goal-bar"><div class="goal-fill" data-id="goal-fill"></div><span data-id="goal-progress"></span></div>
    </div>
    <div class="actions" data-id="actions">
      <button class="act act-merge" data-action="merge" aria-label="Merge train">
        <div class="act-icon icon-merge"><img data-id="icon-merge-a" alt=""><span class="arrow">${ARROW_RIGHT_SVG}</span><img data-id="icon-merge-b" alt=""></div>
        <div class="act-body"><div class="act-title">MERGE<br>TRAIN</div><div class="price"><span class="coin-icon">${COIN_SVG}</span><span data-id="price-merge"></span></div></div>
      </button>
      <button class="act act-add" data-action="add" aria-label="Add car">
        <div class="act-icon icon-add"><img data-id="icon-add" alt=""><span class="badge">${PLUS_SVG}</span></div>
        <div class="act-body"><div class="act-title">ADD<br>CAR</div><div class="price"><span class="coin-icon">${COIN_SVG}</span><span data-id="price-add"></span></div></div>
      </button>
      <button class="act act-gate" data-action="gate" aria-label="Add reward line">
        <div class="act-icon icon-gate"><img data-id="icon-gate" alt=""></div>
        <div class="act-body"><div class="act-title">ADD REWARD<br>LINE</div><div class="price"><span class="coin-icon">${COIN_SVG}</span><span data-id="price-gate"></span></div></div>
      </button>
      <button class="act act-track" data-action="track" aria-label="Upgrade track">
        <div class="act-icon icon-track"><img data-id="icon-track" alt=""><span class="badge up">${ARROW_UP_SVG}</span></div>
        <div class="act-body"><div class="act-title">UPGRADE<br>TRACK</div><div class="price"><span class="coin-icon">${COIN_SVG}</span><span data-id="price-track"></span></div></div>
      </button>
    </div>
  </div>
  <div class="tutorial-text" data-id="tutorial-text" hidden></div>
  <div class="hand" data-id="hand" hidden>👆</div>
</div>
<div class="fx-layer" data-id="fx-layer"></div>
<div class="flash" data-id="flash"></div>
<div class="modal-root" data-id="modal-root"></div>
`;

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    root.insertAdjacentHTML('beforeend', TEMPLATE);
    this.$ = (id) => root.querySelector(`[data-id="${id}"]`);
    this.fxLayer = this.$('fx-layer');
    this.buttons = {};
    for (const el of root.querySelectorAll('.act')) {
      const name = el.dataset.action;
      this.buttons[name] = el;
      el.addEventListener('click', () => this.onAction(name));
    }
    this.$('gear').addEventListener('click', () => this.openSettings());
    // Tap sound on every UI button (BallMerge3D SoundsConfig.buttonClickClip).
    root.addEventListener('click', (e) => e.target.closest('button') && this.game.audio.play('button'), true);
    this.text = new Map(); // last values written, to avoid DOM churn
    this.tutorial = null;
    this.modal = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.root.clientWidth;
    this.root.style.setProperty('--u', `${w / 100}px`);
    if (this.tutorial) this.placeHand(this.tutorial);
  }

  set(id, value, html = false) {
    if (this.text.get(id) === value) return;
    this.text.set(id, value);
    const el = this.$(id);
    if (html) el.innerHTML = value;
    else el.textContent = value;
  }

  setIcons(icons) {
    this.$('icon-merge-a').src = icons.carA;
    this.$('icon-merge-b').src = icons.carB;
    this.$('icon-add').src = icons.addCar;
    this.$('icon-gate').src = icons.gate;
    this.$('icon-track').src = icons.track;
  }

  onAction(name) {
    const ok = this.game.doAction(name);
    if (!ok) {
      const el = this.buttons[name];
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      return;
    }
    if (this.tutorial === name) this.hideTutorial(true);
  }

  // Called ~10x per second.
  update() {
    const { state, goals } = this.game;
    this.set('coins', formatCoins(state.coins));
    this.set('rate', formatRate(state.incomeRate()));
    this.set('stage', String(state.stage + 1));
    this.set('goalnum', `${state.goalIndex + 1}/${goals.goalCount()}`);

    const [before, num, after] = goals.describe();
    this.set('goal-text', `${before}${num ? `<b>${num}</b>` : ''}${after}`, true);
    const { value, target } = goals.progress();
    const g = state.goal;
    let label;
    if (g?.type === 'collect' || g?.type === 'income') label = `${formatCompact(value)} / ${formatCompact(target)}`;
    else label = `${Math.min(Math.floor(value), target)} / ${target}`;
    this.set('goal-progress', label);
    const pct = Math.max(0, Math.min(100, (value / target) * 100)).toFixed(1);
    if (this.text.get('goal-fill') !== pct) {
      this.text.set('goal-fill', pct);
      this.$('goal-fill').style.width = `${pct}%`;
    }

    // Buttons: visibility, price labels and affordability.
    const visible = goals.visibleButtons();
    for (const [name, el] of Object.entries(this.buttons)) el.hidden = !visible.includes(name);
    this.$('actions').classList.toggle('single', visible.length === 1);

    const c = state.coins;
    const mp = state.mergePrice();
    this.price('merge', mp === null ? 'NO PAIR' : formatPrice(mp), mp !== null && c >= mp);
    const full = state.isCarsFull();
    this.price('add', full ? 'FULL' : formatPrice(state.carPrice()), !full && c >= state.carPrice());
    const gFull = state.isGatesFull();
    this.price('gate', gFull ? (state.isTrackMax() ? 'MAX' : 'FULL') : formatPrice(state.gatePrice()), !gFull && c >= state.gatePrice());
    const tMax = state.isTrackMax();
    this.price('track', tMax ? 'MAX' : formatPrice(state.trackPrice()), !tMax && c >= state.trackPrice());

    this.updateTutorial(visible);
  }

  price(name, label, ok) {
    this.set(`price-${name}`, label);
    this.buttons[name].classList.toggle('poor', !ok);
  }

  // --- tutorial spotlight ----------------------------------------------------------

  updateTutorial(visible) {
    const { state } = this.game;
    const t = state.goal?.tutorial;
    if (this.tutorial && this.tutorial !== t) this.hideTutorial(false);
    if (!t || this.tutorial || this.modal || state.tutorialsSeen[t] || !visible.includes(t)) return;
    if (this.buttons[t].classList.contains('poor')) return;
    this.tutorial = t;
    const btn = this.buttons[t];
    btn.classList.add('spotlight');
    const text = this.$('tutorial-text');
    text.textContent = TUTORIAL_TEXT[t];
    text.hidden = false;
    this.$('hand').hidden = false;
    requestAnimationFrame(() => this.placeHand(t));
  }

  placeHand(name) {
    const btn = this.buttons[name];
    const hand = this.$('hand');
    const r = btn.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    hand.style.left = `${r.left - root.left + r.width * 0.5}px`;
    hand.style.top = `${r.top - root.top + r.height * 0.55}px`;
  }

  hideTutorial(seen) {
    if (!this.tutorial) return;
    if (seen) this.game.state.tutorialsSeen[this.tutorial] = true;
    this.buttons[this.tutorial].classList.remove('spotlight');
    this.$('tutorial-text').hidden = true;
    this.$('hand').hidden = true;
    this.tutorial = null;
  }

  // --- feedback ---------------------------------------------------------------------

  coinTarget() {
    const icon = this.$('coin-icon').getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    return { x: icon.left - root.left + icon.width / 2, y: icon.top - root.top + icon.height / 2 };
  }

  bumpCoins() {
    this.$('coins-box').animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'ease-out' },
    );
  }

  toast(text) {
    const el = this.$('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  // White flash used to hide the track rebuild. Resolves at full white.
  async flash() {
    const el = this.$('flash');
    el.classList.add('on');
    await new Promise((r) => setTimeout(r, 260));
    return () => el.classList.remove('on');
  }

  setFps(fps) {
    const el = this.$('fps');
    if (fps === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = `${Math.round(fps)} FPS`;
  }

  // --- modals -----------------------------------------------------------------------

  openModal(html, cls = '') {
    this.closeModal();
    this.hideTutorial(false);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    this.$('modal-root').appendChild(back);
    this.modal = back;
    return back;
  }

  closeModal() {
    this.modal?.remove();
    this.modal = null;
  }

  showStageComplete(stageNumber) {
    const m = this.openModal(`
      <div class="ribbon">STAGE ${stageNumber}</div>
      <h2>COMPLETE!</h2>
      <button class="mbtn green" data-act="ok">CONTINUE</button>`, 'stage-modal');
    m.querySelector('[data-act="ok"]').addEventListener('click', () => this.closeModal());
  }

  // BallMerge3D UOfflineIncomePopup: one Collect button, no x2.
  showOfflineIncome(reward, onCollect) {
    const m = this.openModal(`
      <div class="ribbon">WELCOME BACK</div>
      <h2>OFFLINE INCOME</h2>
      <div class="reward"><span class="coin-icon">${COIN_SVG}</span>+${formatCompact(reward)}</div>
      <button class="mbtn green" data-act="ok">COLLECT</button>`, 'stage-modal');
    m.querySelector('[data-act="ok"]').addEventListener('click', () => {
      this.closeModal();
      onCollect();
    });
  }

  openSettings() {
    const { audio } = this.game;
    const m = this.openModal(`
      <button class="close" data-act="close" aria-label="Close">${CLOSE_SVG}</button>
      <h2>SETTINGS</h2>
      <div class="row">
        <button class="mbtn ${audio.soundOn ? 'green' : 'gray'}" data-act="sound">SOUND ${audio.soundOn ? 'ON' : 'OFF'}</button>
        <button class="mbtn ${audio.musicOn ? 'green' : 'gray'}" data-act="music">MUSIC ${audio.musicOn ? 'ON' : 'OFF'}</button>
      </div>
      <button class="mbtn purple" data-act="debug">🛠 TEST MENU</button>
      <button class="mbtn red" data-act="reset">RESET PROGRESS</button>
      <p class="hint">Drag to rotate · pinch or scroll to zoom · double-tap to reset view</p>`);
    m.querySelector('[data-act="close"]').addEventListener('click', () => this.closeModal());
    m.querySelector('[data-act="debug"]').addEventListener('click', () => this.openDebug());
    m.querySelector('[data-act="sound"]').addEventListener('click', () => {
      audio.setSound(!audio.soundOn);
      this.openSettings();
    });
    m.querySelector('[data-act="music"]').addEventListener('click', () => {
      audio.setMusic(!audio.musicOn);
      this.openSettings();
    });
    m.querySelector('[data-act="reset"]').addEventListener('click', () => this.confirmReset());
  }

  confirmReset() {
    const m = this.openModal(`
      <h2>RESET?</h2>
      <p>All coins, cars and stages will be lost. This can't be undone.</p>
      <div class="row">
        <button class="mbtn gray" data-act="no">CANCEL</button>
        <button class="mbtn red" data-act="yes">RESET</button>
      </div>`);
    m.querySelector('[data-act="no"]').addEventListener('click', () => this.closeModal());
    m.querySelector('[data-act="yes"]').addEventListener('click', () => this.game.resetProgress());
  }

  openDebug() {
    const dbg = this.game.debug;
    const m = this.openModal(`
      <button class="close" data-act="close" aria-label="Close">${CLOSE_SVG}</button>
      <h2>TEST MENU</h2>
      <div class="dgrid">
        <button class="dbtn" data-coins="1000">+1K</button>
        <button class="dbtn" data-coins="100000">+100K</button>
        <button class="dbtn" data-coins="10000000">+10M</button>
        <button class="dbtn" data-coins="1000000000">+1B</button>
      </div>
      <div class="dlabel">GAME SPEED</div>
      <div class="dgrid three">
        <button class="dbtn" data-speed="1">x1</button>
        <button class="dbtn" data-speed="3">x3</button>
        <button class="dbtn" data-speed="10">x10</button>
      </div>
      <div class="dlabel">ADD CAR OF LEVEL</div>
      <div class="dgrid stepper">
        <button class="dbtn" data-act="lvl-">−</button>
        <div class="dvalue" data-id="dbg-level">${dbg.carLevel}</div>
        <button class="dbtn" data-act="lvl+">+</button>
        <button class="dbtn green" data-act="add-car">ADD</button>
      </div>
      <div class="dgrid two">
        <button class="dbtn" data-act="goal">COMPLETE GOAL</button>
        <button class="dbtn" data-act="stage">SKIP STAGE</button>
        <button class="dbtn" data-act="track">TRACK +1 (FREE)</button>
        <button class="dbtn" data-act="gate">REWARD LINE (FREE)</button>
        <button class="dbtn" data-act="fps">TOGGLE FPS</button>
        <button class="dbtn red" data-act="reset">RESET PROGRESS</button>
      </div>`, 'debug-modal');
    const speedBtns = m.querySelectorAll('[data-speed]');
    const markSpeed = () => speedBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === this.game.timeScale));
    markSpeed();
    m.querySelector('[data-act="close"]').addEventListener('click', () => this.closeModal());
    m.querySelectorAll('[data-coins]').forEach((b) =>
      b.addEventListener('click', () => {
        dbg.addCoins(Number(b.dataset.coins));
        this.toast(`+${formatCompact(Number(b.dataset.coins))} COINS`);
      }),
    );
    speedBtns.forEach((b) =>
      b.addEventListener('click', () => {
        dbg.setSpeed(Number(b.dataset.speed));
        markSpeed();
      }),
    );
    const lvl = m.querySelector('[data-id="dbg-level"]');
    const step = (d) => {
      dbg.carLevel = Math.max(1, Math.min(this.game.state.maxCarLevel, dbg.carLevel + d));
      lvl.textContent = dbg.carLevel;
    };
    m.querySelector('[data-act="lvl-"]').addEventListener('click', () => step(-1));
    m.querySelector('[data-act="lvl+"]').addEventListener('click', () => step(1));
    m.querySelector('[data-act="add-car"]').addEventListener('click', () => {
      if (!dbg.addCar(dbg.carLevel)) this.toast('TRAIN IS FULL');
    });
    const on = (act, fn) => m.querySelector(`[data-act="${act}"]`).addEventListener('click', fn);
    on('goal', () => dbg.completeGoal());
    on('stage', () => dbg.skipStage());
    on('track', () => {
      if (!dbg.upgradeTrack()) this.toast('TRACK IS MAX');
    });
    on('gate', () => {
      if (!dbg.addGate()) this.toast('NO FREE SLOT');
    });
    on('fps', () => dbg.toggleFps());
    on('reset', () => this.confirmReset());
  }
}
