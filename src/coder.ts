import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendLog } from './log';
import { readJsonFile, writeJsonFile } from './state';
import { CoderAttemptResult, CoderOutput, ResearcherOutput, RunState } from './types';

function buildPrompt(researcherOutput: ResearcherOutput, retryIssues: string[] = []): string {
  const retrySection = retryIssues.length
    ? [
        '',
        'Reviewer feedback from the previous failed attempt:',
        ...retryIssues.map((issue, index) => `${index + 1}. ${issue}`),
        '',
        'You must fix these issues in this attempt.'
      ].join('\n')
    : '';

  return [
    'You are generating the smallest useful portfolio artifact for a local repo.',
    'You must stay tightly grounded in the researcher output. Do not invent a random demo.',
    'Return ONLY valid JSON. No markdown fences. No explanation.',
    'Required JSON shape:',
    '{',
    '  "artifactFilename": string,',
    '  "artifactCode": string,',
    '  "readme": string,',
    '  "caseStudy": string,',
    '  "grounding": {',
    '    "artifactReason": string,',
    '    "constraintsAddressed": string[],',
    '    "acceptanceChecks": string[],',
    '    "tradeoffs": string[]',
    '  }',
    '}',
    '',
    'Hard requirements:',
    '- The artifact must directly satisfy the stated goal',
    '- The artifact kind should match candidateArtifact.kind unless there is a strong reason not to',
    '- Keep dependencies minimal or zero',
    '- README MUST include a fenced bash run block (exactly a markdown fence starting with ```bash) that contains a concrete, runnable command with no placeholders. Examples:',
    "  Example for a single-file Node script:\n  ```bash\n  node artifact.js\n  ```",
    "  Example when dependencies are required:\n  ```bash\n  npm install && node artifact.js\n  ```",
    "  The command must be directly runnable in a typical developer environment for this repo (no <...> placeholders). If extra setup is required, include the minimal setup commands in the same fenced block (each command on its own line).",
    '- README must also explain why this artifact was chosen (one short paragraph)',
    '- Case study must include problem, approach, output, tradeoffs, and why it matters',
    '- Prefer a single-file script when possible',
    "- If the input is underspecified, choose the smallest artifact that still matches the goal and explain the tradeoff explicitly",
    retrySection,
    '',
    'Researcher output:',
    JSON.stringify(researcherOutput, null, 2)
  ].join('\n');
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error('Could not extract JSON from coder output');
}

function chooseFallbackExtension(kind: ResearcherOutput['candidateArtifact']['kind']): string {
  if (kind === 'app' || kind === 'service' || kind === 'script') {
    return 'js';
  }
  if (kind === 'config') {
    return 'json';
  }
  return 'txt';
}

function sanitizeArtifactFilename(filename: string, kind: ResearcherOutput['candidateArtifact']['kind']): string {
  const trimmed = filename.trim();
  const base = path.basename(trimmed);
  if (!base || base === '.' || base === '..') {
    return `artifact.${chooseFallbackExtension(kind)}`;
  }
  return base;
}

function validateCoderOutput(parsed: CoderOutput, researcherOutput: ResearcherOutput): void {
  if (!parsed.artifactCode?.trim()) {
    throw new Error('Coder produced empty artifactCode');
  }

  if (!parsed.readme?.includes('```bash')) {
    throw new Error('Coder README is missing a bash run block');
  }

  if (!parsed.caseStudy?.toLowerCase().includes('tradeoff')) {
    throw new Error('Coder case study is missing tradeoff discussion');
  }

  if (!parsed.grounding?.artifactReason?.trim()) {
    throw new Error('Coder output is missing grounding.artifactReason');
  }

  if (!Array.isArray(parsed.grounding.constraintsAddressed) || parsed.grounding.constraintsAddressed.length === 0) {
    throw new Error('Coder output is missing grounding.constraintsAddressed');
  }

  const expectedKind = researcherOutput.candidateArtifact.kind;
  const filename = parsed.artifactFilename.toLowerCase();
  if (expectedKind === 'script' && !(/\.(py|js|ts|sh)$/.test(filename))) {
    throw new Error(`Expected script-like artifact filename, got ${parsed.artifactFilename}`);
  }
}

function resetOutputDir(outputDir: string): void {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
}

function runClaudeAttempt(prompt: string): CoderAttemptResult {
  const result = spawnSync('claude', ['--permission-mode', 'bypassPermissions', '--print', prompt], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4
  });

  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();

  if (result.status !== 0) {
    return {
      ok: false,
      error: stderr || `claude exited with code ${result.status}`,
      stderr,
      stdoutPreview: stdout.slice(0, 800),
      exitCode: result.status
    };
  }

  try {
    const parsed = JSON.parse(extractJson(stdout)) as CoderOutput;
    return { ok: true, output: parsed, stdoutPreview: stdout.slice(0, 800), exitCode: result.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stderr,
      stdoutPreview: stdout.slice(0, 800),
      exitCode: result.status
    };
  }
}

export function runCoder(runStatePath = 'state/run.json', retryIssues: string[] = []): CoderOutput {
  const runStateAbsolutePath = path.resolve(runStatePath);
  const runState = readJsonFile<RunState>(runStateAbsolutePath);
  const researcherOutput = readJsonFile<ResearcherOutput>(path.resolve('state/researcher-output.json'));
  const startedAt = new Date().toISOString();
  const prompt = buildPrompt(researcherOutput, retryIssues);

  runState.pipeline.status = 'coder-running';
  runState.pipeline.iterationCount += 1;
  runState.coder.status = 'running';
  runState.coder.startedAt = startedAt;
  runState.coder.error = null;
  if (retryIssues.length > 0) {
    runState.coder.retryCount += 1;
  }
  writeJsonFile(runStateAbsolutePath, runState);
  appendLog('agent-started', { runId: runState.runId, agent: 'coder', retryCount: runState.coder.retryCount });
  writeJsonFile(path.resolve('state/coder-prompt.json'), {
    runId: runState.runId,
    retryIssues,
    prompt
  });

  const firstAttempt = runClaudeAttempt(prompt);
  let finalAttempt = firstAttempt;

  if (!firstAttempt.ok && retryIssues.length === 0) {
    appendLog('handoff', {
      runId: runState.runId,
      from: 'coder',
      to: 'coder',
      reason: 'retry-after-raw-coder-failure',
      error: firstAttempt.error,
      exitCode: firstAttempt.exitCode
    });
    runState.coder.retryCount += 1;
    writeJsonFile(runStateAbsolutePath, runState);
    finalAttempt = runClaudeAttempt(prompt);
  }

  if (!finalAttempt.ok || !finalAttempt.output) {
    runState.coder.status = 'failed';
    runState.coder.completedAt = new Date().toISOString();
    runState.coder.error = finalAttempt.error ?? 'Coder failed';
    runState.pipeline.status = 'needs-human';
    writeJsonFile(runStateAbsolutePath, runState);
    writeJsonFile(path.resolve('state/coder-error.json'), {
      runId: runState.runId,
      error: finalAttempt.error,
      stderr: finalAttempt.stderr ?? '',
      stdoutPreview: finalAttempt.stdoutPreview ?? '',
      exitCode: finalAttempt.exitCode ?? null,
      retryCount: runState.coder.retryCount
    });
    appendLog('agent-failed', {
      runId: runState.runId,
      agent: 'coder',
      error: runState.coder.error,
      exitCode: finalAttempt.exitCode ?? null,
      retryCount: runState.coder.retryCount
    });
    throw new Error(runState.coder.error ?? 'Coder failed');
  }

  const parsed = finalAttempt.output;
  parsed.artifactFilename = sanitizeArtifactFilename(
    parsed.artifactFilename || `artifact.${chooseFallbackExtension(researcherOutput.candidateArtifact.kind)}`,
    researcherOutput.candidateArtifact.kind
  );

  try {
    validateCoderOutput(parsed, researcherOutput);
  } catch (error) {
    runState.coder.status = 'failed';
    runState.coder.completedAt = new Date().toISOString();
    runState.coder.error = error instanceof Error ? error.message : String(error);
    runState.pipeline.status = 'needs-human';
    writeJsonFile(runStateAbsolutePath, runState);
    writeJsonFile(path.resolve('state/coder-error.json'), {
      runId: runState.runId,
      error: runState.coder.error,
      stderr: finalAttempt.stderr ?? '',
      stdoutPreview: finalAttempt.stdoutPreview ?? '',
      exitCode: finalAttempt.exitCode ?? null,
      retryCount: runState.coder.retryCount
    });
    appendLog('agent-failed', {
      runId: runState.runId,
      agent: 'coder',
      error: runState.coder.error,
      exitCode: finalAttempt.exitCode ?? null,
      retryCount: runState.coder.retryCount
    });
    throw error;
  }

  const outputDir = path.resolve('output', runState.runId);
  resetOutputDir(outputDir);

  const artifactPath = path.join(outputDir, parsed.artifactFilename);
  fs.writeFileSync(artifactPath, parsed.artifactCode);
  fs.writeFileSync(path.join(outputDir, 'README.md'), parsed.readme);
  fs.writeFileSync(path.join(outputDir, 'CASE_STUDY.md'), parsed.caseStudy);
  fs.writeFileSync(path.join(outputDir, 'GROUNDING.json'), JSON.stringify(parsed.grounding, null, 2) + '\n');

  runState.coder.status = 'done';
  runState.coder.completedAt = new Date().toISOString();
  runState.coder.costUsd = 0;
  writeJsonFile(runStateAbsolutePath, runState);
  appendLog('agent-completed', {
    runId: runState.runId,
    agent: 'coder',
    outputDir: path.relative(process.cwd(), outputDir),
    retryCount: runState.coder.retryCount
  });

  return parsed;
}
