# swarm-pipeline

A small orchestrated pipeline for generating portfolio-ready artifacts with agent handoffs. Current state: the skeleton boots from a simple input file, writes shared run state, runs a researcher agent to normalize the work, then runs a coder agent to generate a tiny runnable artifact plus docs and grounding metadata.

## Run orchestrator

```bash
npm install
npm run dev
```

## Run researcher directly

```bash
npm run research -- input/sample.json
```

## Output so far

- `state/run.json` — shared runtime state
- `state/log.jsonl` — append-only lifecycle log
- `state/researcher-output.json` — normalized findings for the next agent
- `output/<runId>/` — generated artifact, README, case study, and grounding metadata
- `state/reviewer-output.json` — deterministic validation results for the latest run
- `state/coder-prompt.json` / `state/coder-error.json` — coder diagnostics when Claude misbehaves
- `output/<runId>/RUN_SUMMARY.json` — machine-readable run summary (status, per-step timing, artifacts, verdicts)
