import execa from 'execa'
import type { NextInstance } from '../../../lib/e2e-utils'

export async function expectTypecheckingSuccess(next: NextInstance) {
  const result = await execa('pnpm', ['tsc', '--noEmit'], {
    reject: false,
    cwd: next.testDir,
  })
  if (result.exitCode !== 0) {
    throw new Error(
      `Typechecking failed with exit code ${result.exitCode}:\n` + result.all
    )
  }
}
