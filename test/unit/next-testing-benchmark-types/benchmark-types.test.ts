import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

it('retains the pinned benchmark baseline, source callback and report data types', () => {
  const result = JSON.parse(
    execFileSync(process.execPath, [join(__dirname, 'benchmark-types.cjs')], {
      encoding: 'utf8',
      timeout: 30000,
    })
  )
  expect(result).toMatchObject({
    rootConfigAndGlobalAugmentations: true,
    noExternalVitestViteTinybenchDeclarations: true,
    typeOnlyNoBenchmarkExecution: true,
    programs: 24,
    accepted: 11,
    rejected: 13,
  })
}, 35000)
