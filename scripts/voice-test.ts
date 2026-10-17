/**
 * Voice note end to end: makes a Spanish audio with macOS `say` (voice Paulina), converts it to
 * OGG/Opus like a Telegram voice note (`afconvert`, or m4a if Opus is not available) and runs
 * `pnpm dry-run --audio <file>` with the real pipeline. Extra flags go to the dry-run.
 * Usage: pnpm voice-test ["<texto>"] [--approve] [--undo] [--file <audio existente>]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--');
const fi = args.indexOf('--file');
let file = fi >= 0 ? args.splice(fi, 2)[1] : undefined;
const flags = args.filter((a) => a.startsWith('--'));
const text = args.filter((a) => !a.startsWith('--')).join(' ') || 'subí el pan flauta a 95';

function run(cmd: string, a: string[], quiet = false): boolean {
  return spawnSync(cmd, a, { stdio: quiet ? 'ignore' : 'inherit' }).status === 0;
}

if (!file) {
  const dir = mkdtempSync(join(tmpdir(), 'dale-voz-'));
  const aiff = join(dir, 'voz.aiff');
  if (!run('say', ['-v', 'Paulina', '-o', aiff, text]) && !run('say', ['-o', aiff, text])) {
    console.error('No pude generar el audio con `say` (¿macOS?). Pasá uno con --file.');
    process.exit(1);
  }
  file = join(dir, 'voz.ogg');
  // afconvert in some macOS versions can't write Ogg ('pck?'): then m4a (AAC), which the API also takes.
  if (!run('afconvert', ['-f', 'Oggf', '-d', 'opus', aiff, file], true)) {
    file = join(dir, 'voz.m4a');
    if (!run('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, file])) process.exit(1);
  }
  console.log(`🎙️ audio generado: "${text}" → ${file}`);
}

const r = spawnSync('pnpm', ['--filter', '@dale/worker', 'dry-run', '--audio', file, ...flags], { stdio: 'inherit' });
process.exit(r.status ?? 1);
