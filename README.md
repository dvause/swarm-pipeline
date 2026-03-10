# swarm-pipeline

A small orchestrated pipeline for generating portfolio-ready artifacts with agent handoffs. The Day 1 skeleton boots from a simple input file, writes shared run state, records a log entry, checks kill-switch rules, and exits cleanly.

## Run

```bash
npm install
npm run dev
```

Optional custom input:

```bash
npm run dev -- input/sample.json
```
