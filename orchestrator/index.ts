import path from 'node:path';
import { appendLog } from '../src/log';
import { evaluateKillSwitch } from '../src/killSwitch';
import { buildInitialRunState, readJsonFile, writeJsonFile } from '../src/state';
import { InputSpec } from '../src/types';

function main(): void {
  const inputArg = process.argv[2] ?? 'input/sample.json';
  const inputPath = path.resolve(inputArg);
  const runStatePath = path.resolve('state/run.json');
  const input = readJsonFile<InputSpec>(inputPath);
  const state = buildInitialRunState(inputPath);

  writeJsonFile(runStatePath, state);
  appendLog('run-started', {
    runId: state.runId,
    inputPath,
    inputType: input.type,
    goal: input.goal
  });

  const kill = evaluateKillSwitch(state);

  if (kill.triggered) {
    state.pipeline.status = 'killed';
    state.killSwitch.triggered = true;
    state.killSwitch.reason = kill.reason;
    writeJsonFile(runStatePath, state);
    appendLog('kill-switch-triggered', { runId: state.runId, reason: kill.reason });
    console.error(`Kill switch triggered: ${kill.reason}`);
    process.exit(1);
  }

  appendLog('kill-switch-checked', {
    runId: state.runId,
    triggered: false
  });

  console.log(`Bootstrapped ${state.runId}`);
  console.log(`Input type: ${input.type}`);
  console.log(`Goal: ${input.goal}`);
  console.log('Kill switch: not triggered');
}

main();
