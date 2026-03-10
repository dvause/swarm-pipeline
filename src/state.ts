import fs from 'node:fs';
import path from 'node:path';
import { RunState } from './types';

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

export function buildInitialRunState(inputPath: string): RunState {
  const now = new Date().toISOString();
  const runId = `run-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`;

  return {
    runId,
    inputPath,
    startedAt: now,
    pipeline: {
      status: 'booting',
      totalCostUsd: 0,
      iterationCount: 0
    },
    researcher: {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      costUsd: 0,
      error: null
    },
    coder: {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      costUsd: 0,
      error: null,
      retryCount: 0
    },
    reviewer: {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      costUsd: 0,
      error: null,
      passed: false,
      score: 0,
      issues: []
    },
    killSwitch: {
      triggered: false,
      reason: null
    }
  };
}
