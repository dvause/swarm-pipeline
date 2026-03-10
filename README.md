# swarm-pipeline

A small orchestrated pipeline for generating portfolio-ready artifacts with agent handoffs. Current state: the Day 1/2 skeleton boots from a simple input file, writes shared run state, records a log, runs the researcher agent, and exits cleanly.

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
