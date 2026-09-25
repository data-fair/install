import { runTlsCheck } from './lib/tls-check.ts'

process.exit(await runTlsCheck(console.log) ? 0 : 1)
