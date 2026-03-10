import fs from 'node:fs';

export function appendLog(event: string, payload: Record<string, unknown> = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...payload
  };

  fs.appendFileSync('state/log.jsonl', JSON.stringify(entry) + '\n');
}
