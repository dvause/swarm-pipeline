import { RunState } from './types';

const MAX_ITERATIONS = 10;
const MAX_COST_USD = 5;
const MAX_RUNTIME_MS = 45 * 60 * 1000;

export function evaluateKillSwitch(state: RunState): { triggered: boolean; reason: RunState['killSwitch']['reason'] } {
  const startedAt = new Date(state.startedAt).getTime();
  const runtimeMs = Date.now() - startedAt;

  if (state.killSwitch.reason === 'manual') {
    return { triggered: true, reason: 'manual' };
  }

  if (state.pipeline.iterationCount > MAX_ITERATIONS) {
    return { triggered: true, reason: 'max-iterations' };
  }

  if (state.pipeline.totalCostUsd > MAX_COST_USD) {
    return { triggered: true, reason: 'max-cost' };
  }

  if (runtimeMs > MAX_RUNTIME_MS) {
    return { triggered: true, reason: 'timeout' };
  }

  return { triggered: false, reason: null };
}
