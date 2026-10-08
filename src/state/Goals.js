import { LOOPED_STAGES, STAGES } from '../config.js';
import { formatCompact, niceRound } from '../utils/format.js';

// Stage goals: 2–4 per stage (BallMerge3D levels), done one after another. The active goal is stored on the state (with a snapshot
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
        return g.target === 1 ? ['BUILD A REWARD LINE', '', ''] : ['BUILD ', n, ' REWARD LINES'];
      case 'track':
        return g.target === 1 ? ['UPGRADE THE TRACK', '', ''] : ['UPGRADE TRACK ', n, ' TIMES'];
      case 'collect':
        return ['COLLECT ', n, ' COINS'];
      case 'carLevel':
        return ['GET A LEVEL ', n, ' CAR'];
      case 'income':
        return ['REACH ', n, '/S INCOME'];
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
    if (s.goalIndex < this.goalCount() - 1) {
      s.goalIndex++;
      this.activate();
      return 'goal';
    }
    s.stage++;
    s.goalIndex = 0;
    this.activate();
    return 'stage';
  }

  stageDefs(stage) {
    if (stage < STAGES.length) return STAGES[stage];
    const first = STAGES.length - LOOPED_STAGES;
    return STAGES[first + ((stage - STAGES.length) % LOOPED_STAGES)];
  }

  goalCount() {
    return this.stageDefs(this.state.stage).length;
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
    let def = { ...this.stageDefs(stage)[index] };

    // BallMerge3D GoalInstance.ClampTarget: never ask for something that cannot happen.
    if (def.type === 'incomePct') def = { ...def, type: 'income', target: niceRound(s.incomeRate() * (1 + def.target / 100)) };
    const canAddGate = !s.isGatesFull() || (!s.isTrackMax() && (s.unlocked.track || def.unlock === 'track'));
    if (def.type === 'gates' && !canAddGate) def = { type: 'collect', target: this.collectTarget() };
    if (def.type === 'track' && s.isTrackMax()) def = { type: 'collect', target: this.collectTarget() };
    if (def.type === 'income' && def.target <= s.incomeRate()) def.target = niceRound(s.incomeRate() * 1.05 + 1);
    return def;
  }

  collectTarget() {
    return niceRound(Math.max(1000, this.state.incomeRate() * 180));
  }
}
