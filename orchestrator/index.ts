import path from 'node:path';
import { runCoder } from '../src/coder';
import { appendLog } from '../src/log';
import { evaluateKillSwitch } from '../src/killSwitch';
import { runResearcher } from '../src/researcher';
import { runReviewer } from '../src/reviewer';
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

  const researcherOutput = runResearcher(inputPath, runStatePath);
  const coderOutput = runCoder(runStatePath);
  const reviewerOutput = runReviewer(runStatePath);

  console.log(`Bootstrapped ${state.runId}`);
  console.log(`Input type: ${input.type}`);
  console.log(`Goal: ${input.goal}`);
  console.log(`Researcher artifact kind: ${researcherOutput.candidateArtifact.kind}`);
  console.log(`Coder artifact file: ${coderOutput.artifactFilename}`);
  console.log(`Reviewer passed: ${reviewerOutput.passed} (score: ${reviewerOutput.score})`);
  console.log('Kill switch: not triggered');
}

main();
