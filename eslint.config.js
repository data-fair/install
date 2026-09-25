import neostandard from 'neostandard'

export default [
  ...neostandard({ ts: true }),
  { ignores: ['node_modules', 'test/reports', 'test-results', 'playwright-report', '.superpowers'] }
]
