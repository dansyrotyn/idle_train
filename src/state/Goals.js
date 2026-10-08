import { ECONOMY, STAGES } from '../config.js';
import { formatCompact, niceRound } from '../utils/format.js';

// Stage goals: three per stage. The active goal is stored on the state (with a snapshot
// of the counters at its start) so progress survives reloads.
export class Goals {
  constructor(state) {
    this.state = state;
    if (!state.goal) this.activate();
  }

  get goal() {
    return this.state.goal;
  }

  // Buttons visible right now.
  visibleButtons() {
    const s = this.state;
    const only = s.goal?.only;
    const all = ['merge', 'add', 'gate', 'track'];
    return all.filter((b) => s.unlocked[b] && (!only || only.includes(b)));
  }

  progress() {
    const s = this.state;
    const g = s.goal;
    if (!g) return { value: 0, target: 1 };
    const b = g.base;
    switch (g.type) {
      case 'buyCars':
        return { value: s.stats.carsBought - b.carsBought, target: g.target };
      case 'merges':
        return { value: s.stats.merges - b.merges, target: g.target };
      case 'gates':
        return { value: s.stats.gatesBought - b.gatesBought, target: g.target };
      case 'track':
        return { value: s.stats.trackUpgrades - b.trackUpgrades, target: g.target };
      case 'collect':
        return { value: s.totalEarned - b.totalEarned, target: g.target };
      case 'carLevel':
        return { value: s.maxLevel, target: g.target };
      case 'income':
        return { value: s.incomeRate(), target: g.target };
      default:
        return { value: 0, target: 1 };
    }
  }

  // Text pieces for the goal card: [before, highlighted number, after].
  describe() {
    const g = this.state.goal;
    if (!g) return ['', '', ''];
    const n = formatCompact(g.target);
    switch (g.type) {
      case 'buyCars':
        return ['GET ', n, g.target === 1 ? ' NEW CAR' : ' NEW CARS'];
      case 'merges':
        return ['COMPLETE ', n, g.target === 1 ? ' MERGE' : ' MERGES'];
      case 'gates':
        return g.target === 1 ? ['ADD A REWARD LINE', '', ''] : ['ADD ', n, ' REWARD LINES'];
      case 'track':
        return ['UPGRADE THE TRACK', '', ''];
      case 'collect':
        return ['COLLECT ', n, ' COINS'];
      case 'carLevel':
        return ['GET A LEVEL ', n, ' CAR'];
      case 'income':
        return ['EARN ', n, '/SEC'];
      default:
        return ['', '', ''];
    }
  }

  // Returns 'goal' | 'stage' | null when the active goal just completed.
  check() {
    const g = this.state.goal;
    if (!g) return null;
    const { value, target } = this.progress();
    if (value < target) return null;
    return this.advance();
  }

  advance() {
    const s = this.state;
    if (s.goalIndex < 2) {
      s.goalIndex++;
      this.activate();
      return 'goal';
    }
    s.stage++;
    s.goalIndex = 0;
    this.activate();
    return 'stage';
  }

  stageReward() {
    return niceRound(Math.max(100, this.state.incomeRate() * ECONOMY.stageRewardSeconds));
  }

  activate() {
    const s = this.state;
    const def = this.definition(s.stage, s.goalIndex);
    if (def.unlock) s.unlocked[def.unlock] = true;
    s.goal = {
      ...def,
      base: {
        carsBought: s.stats.carsBought,
        merges: s.stats.merges,
        gatesBought: s.stats.gatesBought,
        trackUpgrades: s.stats.trackUpgrades,
        totalEarned: s.totalEarned,
      },
    };
  }

  definition(stage, index) {
    const s = this.state;
    let def = STAGES[stage]?.[index];
    if (!def) def = this.generated(stage, index);
    def = { ...def };

    // Keep goals achievable: never ask for a reward line or track upgrade that cannot exist.
    const canAddGate = !s.isGatesFull() || (!s.isTrackMax() && (s.unlocked.track || def.unlock === 'track'));
    if (def.type === 'gates' && !canAddGate) def = { type: 'collect', target: this.collectTarget() };
    if (def.type === 'track' && s.isTrackMax()) def = { type: 'income', target: this.incomeTarget() };
    if (def.type === 'carLevel' && def.target <= s.maxLevel) def.target = s.maxLevel + 1;
    if (def.type === 'income' && def.target <= s.incomeRate()) def.target = this.incomeTarget();
    return def;
  }

  generated(stage, index) {
    const s = this.state;
    const k = stage - STAGES.length;
    const counted = 10 + 2 * Math.max(0, k);
    const patterns = [
      ['carLevel', 'merges', 'collect'],
      ['income', 'buyCars', 'carLevel'],
      ['upgrade', 'collect', 'merges'],
    ];
    let type = patterns[stage % patterns.length][index];
    if (type === 'upgrade') type = !s.isTrackMax() ? 'track' : !s.isGatesFull() ? 'gates' : 'collect';
    switch (type) {
      case 'carLevel':
        return { type, target: s.maxLevel + 1 };
      case 'merges':
      case 'buyCars':
        return { type, target: counted };
      case 'income':
        return { type, target: this.incomeTarget() };
      case 'track':
      case 'gates':
        return { type, target: 1 };
      default:
        return { type: 'collect', target: this.collectTarget() };
    }
  }

  collectTarget() {
    return niceRound(Math.max(1000, this.state.incomeRate() * 180));
  }

  incomeTarget() {
    return niceRound(this.state.incomeRate() * 1.6 + 10);
  }
}
