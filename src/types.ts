export type PipelineStatus =
  | 'pending'
  | 'booting'
  | 'researcher-running'
  | 'coder-running'
  | 'reviewer-running'
  | 'complete'
  | 'needs-human'
  | 'killed';

export type AgentStatus = 'pending' | 'running' | 'done' | 'failed';

export type KillReason =
  | 'max-iterations'
  | 'max-cost'
  | 'timeout'
  | 'consecutive-failures'
  | 'manual';

export interface AgentState {
  status: AgentStatus;
  startedAt: string | null;
  completedAt: string | null;
  costUsd: number;
  error: string | null;
}

export interface ReviewerState extends AgentState {
  passed: boolean;
  score: number;
  issues: string[];
}

export interface CoderState extends AgentState {
  retryCount: number;
}

export interface RunState {
  runId: string;
  inputPath: string;
  startedAt: string;
  pipeline: {
    status: PipelineStatus;
    totalCostUsd: number;
    iterationCount: number;
  };
  researcher: AgentState;
  coder: CoderState;
  reviewer: ReviewerState;
  killSwitch: {
    triggered: boolean;
    reason: KillReason | null;
  };
}

export interface InputSpec {
  type: 'spec' | 'csv' | 'url' | 'prompt';
  source: string;
  goal: string;
  notes?: string[];
}
