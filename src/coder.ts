import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendLog } from './log';
import { readJsonFile, writeJsonFile } from './state';
import { CoderOutput, ResearcherOutput, RunState } from './types';

function buildPrompt(researcherOutput: ResearcherOutput): string {
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
    '- README must include a run command and explain why this artifact was chosen',
    '- Case study must include problem, approach, output, tradeoffs, and why it matters',
    '- Prefer a single-file script when possible',
    '- If the input is underspecified, choose the smallest artifact that still matches the goal and explain the tradeoff explicitly',
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

export function runCoder(runStatePath = 'state/run.json'): CoderOutput {
  const runStateAbsolutePath = path.resolve(runStatePath);
  const runState = readJsonFile<RunState>(runStateAbsolutePath);
  const researcherOutput = readJsonFile<ResearcherOutput>(path.resolve('state/researcher-output.json'));
  const startedAt = new Date().toISOString();

  runState.pipeline.status = 'coder-running';
  runState.pipeline.iterationCount += 1;
  runState.coder.status = 'running';
  runState.coder.startedAt = startedAt;
  runState.coder.error = null;
  writeJsonFile(runStateAbsolutePath, runState);
  appendLog('agent-started', { runId: runState.runId, agent: 'coder' });

  const result = spawnSync('claude', ['--permission-mode', 'bypassPermissions', '--print', buildPrompt(researcherOutput)], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4
  });

  if (result.status !== 0) {
    runState.coder.status = 'failed';
    runState.coder.completedAt = new Date().toISOString();
    runState.coder.error = result.stderr.trim() || `claude exited with code ${result.status}`;
    runState.pipeline.status = 'needs-human';
    writeJsonFile(runStateAbsolutePath, runState);
    appendLog('agent-failed', { runId: runState.runId, agent: 'coder', error: runState.coder.error });
    throw new Error(runState.coder.error ?? 'Coder failed');
  }

  const parsed = JSON.parse(extractJson(result.stdout)) as CoderOutput;
  validateCoderOutput(parsed, researcherOutput);

  const outputDir = path.resolve('output', runState.runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const artifactFilename = parsed.artifactFilename?.trim() || `artifact.${chooseFallbackExtension(researcherOutput.candidateArtifact.kind)}`;
  const artifactPath = path.join(outputDir, artifactFilename);
  fs.writeFileSync(artifactPath, parsed.artifactCode);
  fs.writeFileSync(path.join(outputDir, 'README.md'), parsed.readme);
  fs.writeFileSync(path.join(outputDir, 'CASE_STUDY.md'), parsed.caseStudy);
  fs.writeFileSync(path.join(outputDir, 'GROUNDING.json'), JSON.stringify(parsed.grounding, null, 2) + '\n');

  runState.coder.status = 'done';
  runState.coder.completedAt = new Date().toISOString();
  runState.coder.costUsd = 0;
  runState.pipeline.status = 'complete';
  writeJsonFile(runStateAbsolutePath, runState);
  appendLog('agent-completed', { runId: runState.runId, agent: 'coder', outputDir: path.relative(process.cwd(), outputDir) });

  return {
    ...parsed,
    artifactFilename
  };
}
