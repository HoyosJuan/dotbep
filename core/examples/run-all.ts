// run: node --experimental-strip-types examples/run-all.ts  (from core/)
// Runs all examples in sequence. Each example builds on the .bep saved by the previous one.
// Optional: --NN  runs only examples 01 through NN (e.g. --05 stops after 05-standards).
import { execSync } from 'node:child_process'

const examples = [
  '01-participants',
  '02-files',
  '03-workflows',
  '04-bim-uses',
  '05-standards',
  '06-schedule',
  '07-loin',
  '08-deliverables',
  '09-notes',
  '10-llm',
  '11-resolved',
  '12-history',
]

const untilArg = process.argv.find(a => /^--\d{2}$/.test(a))
const untilPrefix = untilArg ? untilArg.slice(2) : null
const toRun = untilPrefix ? examples.filter(e => e.slice(0, 2) <= untilPrefix) : examples

for (const ex of toRun) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  examples/${ex}.ts`)
  console.log('─'.repeat(60))
  execSync(`node --experimental-strip-types examples/${ex}.ts`, {
    stdio: 'inherit',
    cwd:   process.cwd(),
    env:   { ...process.env, DOTBEP_RUN_ALL: '1' },
  })
}

console.log(`\n${'─'.repeat(60)}`)
console.log(untilPrefix ? `  Done (up to ${untilPrefix}).` : '  All examples completed.')
console.log('─'.repeat(60))
