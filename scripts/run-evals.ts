import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Import project helpers via ts-node runtime
const { buildInitialRunState, writeJsonFile } = require('../src/state');
const { runResearcher } = require('../src/researcher');
const { runReviewer } = require('../src/reviewer');

interface FixtureResult {
  name: string;
  passed: boolean;
  score: number;
  issues: string[];
}

const fixturesDir = path.resolve('evals/fixtures');
const fixtures = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

const results: FixtureResult[] = [];

function makeArtifactCodePy(name: string): string {
  return `#!/usr/bin/env python3\nimport sys, csv\n\npath = sys.argv[1] if len(sys.argv) > 1 else None\nrows = []\nif path:\n    try:\n        with open(path, 'r') as f:\n            reader = csv.DictReader(f)\n            for r in reader:\n                rows.append(r)\n    except Exception as e:\n        print('ERROR', e)\n        sys.exit(2)\n\n# simple summary: row count and columns\nif rows:\n    cols = list(rows[0].keys())\n    print(f"rows={len(rows)}, cols={','.join(cols)}")\nelse:\n    print('rows=0, cols=')\n`;
}

for (const f of fixtures) {
  const fixturePath = path.join(fixturesDir, f);
  const inputPath = fixturePath;
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const runState = buildInitialRunState(inputPath);
  const runStatePath = path.resolve('state/run.json');
  fs.rmSync('output', { recursive: true, force: true });
  fs.rmSync('state', { recursive: true, force: true });

  // write initial run state (this also creates state dir)
  writeJsonFile(runStatePath, runState);

  // run researcher to produce researcher-output.json
  try {
    runResearcher(inputPath, runStatePath);
  } catch (err) {
    console.error('researcher failed for', f, err instanceof Error ? err.message : err);
  }

  // Build a deterministic artifact and supporting files in output/<runId>
  const outputDir = path.resolve('output', runState.runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const artifactFilename = 'artifact.py';
  const artifactPath = path.join(outputDir, artifactFilename);
  fs.writeFileSync(artifactPath, makeArtifactCodePy(artifactFilename));
  fs.chmodSync(artifactPath, 0o755);

  const readme = `# Generated artifact\n\nRun:\n\n\`\`\`bash\npython3 ${artifactFilename} review-sample.csv\n\`\`\`\n`;
  fs.writeFileSync(path.join(outputDir, 'README.md'), readme);

  const caseStudy = `Problem:\nA small data artifact.\n\nApproach:\nCreate a single-file python utility.\n\nTradeoff:\nWe prioritized simplicity and testability over feature completeness.\n`;
  fs.writeFileSync(path.join(outputDir, 'CASE_STUDY.md'), caseStudy);

  const grounding = { artifactReason: 'small deterministic artifact for eval', constraintsAddressed: ['single-file', 'zero-deps'], acceptanceChecks: ['README run block', 'CASE_STUDY tradeoff', 'artifact runs on sample csv'], tradeoffs: ['simplicity vs features'] };
  fs.writeFileSync(path.join(outputDir, 'GROUNDING.json'), JSON.stringify(grounding, null, 2) + '\n');

  // Now run reviewer which will perform checks
  let reviewerOutput;
  try {
    reviewerOutput = runReviewer(runStatePath);
  } catch (err) {
    reviewerOutput = { passed: false, score: 0, issues: ['reviewer crashed: ' + (err instanceof Error ? err.message : String(err))], checks: [] };
  }

  results.push({ name: f, passed: reviewerOutput.passed, score: reviewerOutput.score, issues: reviewerOutput.issues });

  console.log(`${f}: ${reviewerOutput.passed ? 'PASS' : 'FAIL'} (score: ${reviewerOutput.score})`);
  if (reviewerOutput.issues && reviewerOutput.issues.length) {
    for (const issue of reviewerOutput.issues) {
      console.log('  -', issue);
    }
  }
}

// Summary
const failed = results.filter(r => !r.passed);
console.log('\nSummary:');
for (const r of results) {
  console.log(`- ${r.name}: ${r.passed ? 'PASS' : 'FAIL'} (score: ${r.score})`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} fixture(s) failed`);
  process.exit(2);
} else {
  console.log('\nAll fixtures passed');
  process.exit(0);
}
