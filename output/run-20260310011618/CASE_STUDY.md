## Case Study: Fantasy Player CSV Analyzer

### Problem
Given a CSV of fantasy football players (`player`, `team`, `position`, `projected_points`), produce a readable summary report that groups players by position, highlights the top scorer per position, and shows overall statistics.

### Approach
A single-file Python script using only the standard library (`csv`, `os`, `collections`). The script resolves its input path relative to `__file__` so it runs correctly from any working directory — fixing the `FileNotFoundError` from the previous attempt which relied on a fragile relative path anchored to the caller's CWD.

### Output
Terminal report with:
- Player count and per-position breakdown
- Top scorer and average projected points per position
- Ranked player list per position
- Overall top scorer and league-wide average

### Tradeoffs
- **No output file**: prints to stdout rather than writing a file, keeping the artifact simpler and easier to inspect. A `--output` flag could be added trivially.
- **No external libraries**: pandas would make aggregation cleaner but adds an install step; stdlib is sufficient for 8 rows.
- **Single position sort key**: ranks by projected points only — appropriate for this dataset.

### Why it matters
This pattern — a portable, zero-dep script that transforms a CSV into a human-readable report — is directly reusable for any tabular data summarization task. The path-resolution fix (`os.path.dirname(__file__)`) is the canonical solution for scripts that need to reference sibling data files.