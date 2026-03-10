import path from 'node:path';
import { runResearcher } from '../../src/researcher';

function main(): void {
  const inputArg = process.argv[2] ?? 'input/sample.json';
  const output = runResearcher(path.resolve(inputArg));
  console.log(JSON.stringify(output, null, 2));
}

main();
