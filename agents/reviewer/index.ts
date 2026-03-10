import { runReviewer } from '../../src/reviewer';

function main(): void {
  const output = runReviewer();
  console.log(JSON.stringify(output, null, 2));
}

main();
