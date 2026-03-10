import fs from 'node:fs';
import path from 'node:path';
import { appendLog } from './log';
import { readJsonFile, writeJsonFile } from './state';
import { RunState } from './types';
import { spawnSync } from 'node:child_process';

export interface ReviewerOutput {
  passed: boolean;
  score: number;
  issues: string[];
  checks: string[];
}

function findArtifactFile(outputDir: string): string | null {
  const entries = fs.readdirSync(outputDir);
  for (const entry of entries) {
    if (entry === 'README.md' || entry === 'CASE_STUDY.md' || entry === 'GROUNDING.json') continue;
    const fullPath = path.join(outputDir, entry);
    if (fs.statSync(fullPath).isFile()) return fullPath;
  }
  return null;
}

function hasRunBlock(readme: string): boolean {
  return /```bash[\s\S]*?```/i.test(readme);
}

function checkPythonArtifact(artifactPath: string): string[] {
  const issues: string[] = [];
  const artifactName = path.basename(artifactPath);

  if (artifactPath.endsWith('.py')) {
    const samplePath = path.join(path.dirname(artifactPath), 'review-sample.csv');
    fs.writeFileSync(samplePath, 'name,age,score\nalice,30,88.5\nbob,25,91.0\n');
    const result = spawnSync('python3', [artifactName, 'review-sample.csv'], {
      cwd: path.dirname(artifactPath),
      encoding: 'utf8',
      timeout: 30000
    });

    if (result.status !== 0) {
      issues.push(`Python artifact failed to execute successfully: ${result.stderr.trim() || result.stdout.trim()}`);
    }
  }

  return issues;
}

export function runReviewer(runStatePath = 'state/run.json'): ReviewerOutput {
  const runStateAbsolutePath = path.resolve(runStatePath);
  const runState = readJsonFile<RunState>(runStateAbsolutePath);
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve('output', runState.runId);
  const issues: string[] = [];
  const checks: string[] = [];

  runState.pipeline.status = 'reviewer-running';
  runState.pipeline.iterationCount += 1;
  runState.reviewer.status = 'running';
  runState.reviewer.startedAt = startedAt;
  runState.reviewer.error = null;
  writeJsonFile(runStateAbsolutePath, runState);
  appendLog('agent-started', { runId: runState.runId, agent: 'reviewer' });

  const readmePath = path.join(outputDir, 'README.md');
  const caseStudyPath = path.join(outputDir, 'CASE_STUDY.md');
  const groundingPath = path.join(outputDir, 'GROUNDING.json');
  const artifactPath = findArtifactFile(outputDir);

  if (!fs.existsSync(outputDir)) issues.push('Output directory does not exist');
  else checks.push('output directory exists');

  if (!artifactPath) issues.push('Artifact file is missing');
  else checks.push(`artifact file exists: ${path.basename(artifactPath)}`);

  if (!fs.existsSync(readmePath)) issues.push('README.md is missing');
  else {
    checks.push('README.md exists');
    const readme = fs.readFileSync(readmePath, 'utf8');
    if (!hasRunBlock(readme)) {
      issues.push('README.md is missing a bash run block');
    } else {
      checks.push('README.md includes bash run block');
    }
  }

  if (!fs.existsSync(caseStudyPath)) issues.push('CASE_STUDY.md is missing');
  else {
    checks.push('CASE_STUDY.md exists');
    const caseStudy = fs.readFileSync(caseStudyPath, 'utf8');
    if (!/tradeoff/i.test(caseStudy)) {
      issues.push('CASE_STUDY.md is missing tradeoff discussion');
    } else {
      checks.push('CASE_STUDY.md includes tradeoff discussion');
    }
  }

  if (!fs.existsSync(groundingPath)) issues.push('GROUNDING.json is missing');
  else {
    checks.push('GROUNDING.json exists');
    try {
      const grounding = JSON.parse(fs.readFileSync(groundingPath, 'utf8')) as Record<string, unknown>;
      if (!grounding.artifactReason) issues.push('GROUNDING.json missing artifactReason');
      else checks.push('GROUNDING.json includes artifactReason');
    } catch (error) {
      issues.push(`GROUNDING.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (artifactPath) {
    issues.push(...checkPythonArtifact(artifactPath));
    if (!issues.some((issue) => issue.startsWith('Python artifact failed'))) {
      checks.push('artifact execution smoke test passed');
    }
  }

  const score = Math.max(0, 100 - issues.length * 15);
  const passed = issues.length === 0;

  const output: ReviewerOutput = { passed, score, issues, checks };
  writeJsonFile(path.resolve('state/reviewer-output.json'), output);

  runState.reviewer.status = passed ? 'done' : 'failed';
  runState.reviewer.completedAt = new Date().toISOString();
  runState.reviewer.costUsd = 0;
  runState.reviewer.passed = passed;
  runState.reviewer.score = score;
  runState.reviewer.issues = issues;
  runState.reviewer.error = passed ? null : issues.join(' | ');
  runState.pipeline.status = passed ? 'complete' : 'needs-human';
  writeJsonFile(runStateAbsolutePath, runState);

  appendLog(passed ? 'agent-completed' : 'agent-failed', {
    runId: runState.runId,
    agent: 'reviewer',
    score,
    issues
  });

  return output;
}
