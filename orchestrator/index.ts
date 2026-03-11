import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCoder } from '../src/coder';
import { appendLog } from '../src/log';
import { evaluateKillSwitch } from '../src/killSwitch';
import { runResearcher } from '../src/researcher';
import { runReviewer } from '../src/reviewer';
import { buildInitialRunState, readJsonFile, writeJsonFile } from '../src/state';
import { InputSpec } from '../src/types';

function buildRunSummary(runStatePath: string, researcherOutput: any, coderOutput: any, reviewerOutput: any) {
  const runState = readJsonFile<any>(runStatePath);
  const outputDir = path.resolve('output', runState.runId);
  let producedFiles: string[] = [];

  try {
    if (fs.existsSync(outputDir)) {
      producedFiles = fs.readdirSync(outputDir).map((f) => path.join('output', runState.runId, f));
    }
  } catch (err) {
    producedFiles = [];
  }

  const startedAt = runState.startedAt;
  const completedAt = runState.reviewer?.completedAt ?? runState.coder?.completedAt ?? new Date().toISOString();

  function durationMs(start?: string | null, end?: string | null) {
    if (!start) return null;
    try {
      const s = new Date(start).getTime();
      const e = end ? new Date(end).getTime() : Date.now();
      return Math.max(0, e - s);
    } catch (_) {
      return null;
    }
  }

  const summary: any = {
    runId: runState.runId,
    input: {
      inputPath: runState.inputPath,
    },
    overall: {
      status: runState.pipeline.status,
      startedAt: startedAt,
      completedAt: completedAt,
      durationMs: durationMs(startedAt, completedAt),
      totalCostUsd: runState.pipeline.totalCostUsd
    },
    steps: {
      researcher: {
        status: runState.researcher.status,
        startedAt: runState.researcher.startedAt,
        completedAt: runState.researcher.completedAt,
        durationMs: durationMs(runState.researcher.startedAt, runState.researcher.completedAt),
        error: runState.researcher.error ?? null
      },
      coder: {
        status: runState.coder.status,
        startedAt: runState.coder.startedAt,
        completedAt: runState.coder.completedAt,
        durationMs: durationMs(runState.coder.startedAt, runState.coder.completedAt),
        retryCount: runState.coder.retryCount ?? 0,
        error: runState.coder.error ?? null,
        artifactFilename: coderOutput?.artifactFilename ?? null
      },
      reviewer: {
        status: runState.reviewer.status,
        startedAt: runState.reviewer.startedAt,
        completedAt: runState.reviewer.completedAt,
        durationMs: durationMs(runState.reviewer.startedAt, runState.reviewer.completedAt),
        passed: runState.reviewer.passed ?? reviewerOutput?.passed ?? false,
        score: runState.reviewer.score ?? reviewerOutput?.score ?? null,
        issues: runState.reviewer.issues ?? reviewerOutput?.issues ?? []
      }
    },
    producedFiles,
    failureReason: runState.killSwitch?.triggered ? runState.killSwitch.reason : (runState.reviewer?.error || runState.coder?.error || null)
  };

  return summary;
}

function printCompactSummary(summary: any) {
  console.log('--- RUN SUMMARY ---');
  console.log(`runId: ${summary.runId}`);
  console.log(`status: ${summary.overall.status}`);
  console.log(`startedAt: ${summary.overall.startedAt}`);
  console.log(`completedAt: ${summary.overall.completedAt}`);
  const dur = summary.overall.durationMs;
  console.log(`durationMs: ${dur !== null ? dur : 'n/a'}`);
  console.log(`researcher: ${summary.steps.researcher.status} (${summary.steps.researcher.durationMs ?? 'n/a'}ms)`);
  console.log(`coder: ${summary.steps.coder.status} (retries: ${summary.steps.coder.retryCount})`);
  console.log(`reviewer: ${summary.steps.reviewer.status} (passed: ${summary.steps.reviewer.passed}, score: ${summary.steps.reviewer.score})`);
  console.log(`artifact: ${summary.steps.coder.artifactFilename ?? 'n/a'}`);
  console.log(`producedFiles: ${summary.producedFiles.length}`);
  if (summary.failureReason) console.log(`failureReason: ${summary.failureReason}`);
  console.log('---');
}

function preflightClaude(): void {
  try {
    const res = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });

    if (res.error) {
      // Missing binary
      if ((res.error as any).code === 'ENOENT') {
        console.error('Preflight failed: "claude" CLI not found in PATH. Install the Claude CLI and ensure it is available in your shell PATH.');
        process.exit(1);
      }
      console.error(`Preflight failed: error executing "claude": ${(res.error as Error).message}`);
      process.exit(1);
    }

    const stdout = (res.stdout || '').toString().toLowerCase();
    const stderr = (res.stderr || '').toString().toLowerCase();

    if (res.status !== 0) {
      const authHints = ['login', 'authenticate', 'not logged', 'not authenticated', 'unauthorized', 'please login', 'no api key', 'unauth'];
      if (authHints.some((h) => stdout.includes(h) || stderr.includes(h))) {
        console.error('Preflight failed: "claude" CLI appears to be installed but not authenticated or not usable. Try running `claude login` or re-authenticating and then re-run this tool.');
        process.exit(1);
      }

      console.error(`Preflight failed: "claude" CLI exited with code ${res.status}. stderr: ${res.stderr}`);
      process.exit(1);
    }

    appendLog('preflight-claude-ok', { checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error(`Preflight failed: unexpected error while checking "claude": ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

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

  // Lightweight preflight to ensure the Claude CLI is present and appears usable.
  preflightClaude();

  let coderOutput = runCoder(runStatePath);
  let reviewerOutput = runReviewer(runStatePath);

  if (!reviewerOutput.passed) {
    appendLog('handoff', {
      runId: state.runId,
      from: 'reviewer',
      to: 'coder',
      reason: 'retry-after-review-failure',
      issues: reviewerOutput.issues
    });

    coderOutput = runCoder(runStatePath, reviewerOutput.issues);
    reviewerOutput = runReviewer(runStatePath);
  }

  // Build and write a machine-readable summary artifact
  const summary = buildRunSummary(runStatePath, researcherOutput, coderOutput, reviewerOutput);
  const outDir = path.resolve('output', summary.runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'RUN_SUMMARY.json'), JSON.stringify(summary, null, 2) + '\n');
  appendLog('run-summary-written', { runId: summary.runId, path: path.join('output', summary.runId, 'RUN_SUMMARY.json') });

  // Print compact human-readable summary
  printCompactSummary(summary);

  console.log(`Bootstrapped ${state.runId}`);
  console.log(`Input type: ${input.type}`);
  console.log(`Goal: ${input.goal}`);
  console.log(`Researcher artifact kind: ${researcherOutput.candidateArtifact.kind}`);
  console.log(`Coder artifact file: ${coderOutput.artifactFilename}`);
  console.log(`Reviewer passed: ${reviewerOutput.passed} (score: ${reviewerOutput.score})`);
  console.log(`Coder retries used: ${reviewerOutput.passed ? readJsonFile<any>(runStatePath).coder.retryCount : 'n/a'}`);
  console.log('Kill switch: not triggered');

  if (!reviewerOutput.passed) {
    process.exit(1);
  }
}

main();
