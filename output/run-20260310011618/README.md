# analyze_players.py

A zero-dependency Python script that reads `input/sample-players.csv` and prints a structured summary report grouped by position.

## Run

```bash
python analyze_players.py
```

Run from the directory where the script lives (e.g. `output/run-<timestamp>/`). The script resolves the input path relative to its own location, so it works regardless of the current working directory.

## Why this artifact?

The input is a small CSV of fantasy football players with projected points. A single-file Python script with no external dependencies is the smallest artifact that satisfies the goal: parse the CSV, group by position, compute per-position averages and rankings, and surface an overall top scorer — all in under 40 lines. No libraries, no install step, no UI.