import fs from 'node:fs';
import path from 'node:path';
import { InputSpec, ResearcherOutput, RunState } from './types';
import { readJsonFile, writeJsonFile } from './state';
import { appendLog } from './log';

function inferArtifactKind(goal: string): ResearcherOutput['candidateArtifact']['kind'] {
  const text = goal.toLowerCase();
  if (text.includes('service') || text.includes('api')) return 'service';
  if (text.includes('app')) return 'app';
  if (text.includes('config')) return 'config';
  if (text.includes('script') || text.includes('utility')) return 'script';
  return 'unknown';
}

function summarizeInput(input: InputSpec): string {
  const noteCount = input.notes?.length ?? 0;
  return `${input.type} input from ${input.source} with goal: ${input.goal}${noteCount ? ` (${noteCount} notes)` : ''}`;
}

function deriveInputs(input: InputSpec): string[] {
  const base = [`source:${input.source}`, `type:${input.type}`];
  return input.notes ? base.concat(input.notes.map((note) => `note:${note}`)) : base;
}

function deriveOutputs(input: InputSpec): string[] {
  return [
    'working artifact in output/',
    'README with run instructions',
    'case-study markdown'
  ];
}

function deriveConstraints(input: InputSpec): string[] {
  const constraints = [
    'Keep scope minimal and runnable',
    'Optimize for reproducible portfolio evidence',
    'No UI unless explicitly requested'
  ];

  if (input.type === 'url') {
    constraints.push('Avoid scraping complexity unless essential');
  }

  if (input.type === 'csv') {
    constraints.push('Prefer local file processing over infrastructure');
  }

  return constraints;
}

function deriveQuestions(input: InputSpec): string[] {
  const questions: string[] = [];

  if (input.type === 'prompt') {
    questions.push('What is the smallest artifact that proves the concept?');
  }

  if (input.source === 'internal') {
    questions.push('Is there a real external input to swap in for the portfolio run?');
  }

  return questions;
}

export function runResearcher(inputPath: string, runStatePath = 'state/run.json'): ResearcherOutput {
  const absoluteInputPath = path.resolve(inputPath);
  const input = readJsonFile<InputSpec>(absoluteInputPath);
  const runState = readJsonFile<RunState>(path.resolve(runStatePath));
  const startedAt = new Date().toISOString();

  runState.pipeline.status = 'researcher-running';
  runState.pipeline.iterationCount += 1;
  runState.researcher.status = 'running';
  runState.researcher.startedAt = startedAt;
  runState.researcher.error = null;
  writeJsonFile(path.resolve(runStatePath), runState);
  appendLog('agent-started', { runId: runState.runId, agent: 'researcher' });

  const output: ResearcherOutput = {
    inputType: input.type,
    source: input.source,
    goal: input.goal,
    summary: summarizeInput(input),
    candidateArtifact: {
      kind: inferArtifactKind(input.goal),
      rationale: 'Initial heuristic based on the requested outcome; refine once coder/reviewer loops exist.'
    },
    inputs: deriveInputs(input),
    outputs: deriveOutputs(input),
    constraints: deriveConstraints(input),
    questions: deriveQuestions(input),
    nextAction: 'Use this output to generate the smallest runnable artifact plus docs.'
  };

  fs.mkdirSync('state', { recursive: true });
  writeJsonFile(path.resolve('state/researcher-output.json'), output);

  runState.researcher.status = 'done';
  runState.researcher.completedAt = new Date().toISOString();
  runState.researcher.costUsd = 0;
  runState.pipeline.status = 'booting';
  writeJsonFile(path.resolve(runStatePath), runState);
  appendLog('agent-completed', { runId: runState.runId, agent: 'researcher', outputPath: 'state/researcher-output.json' });

  return output;
}
