import * as childProcess from 'child_process'
import path from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe('typechecking', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'typechecking')),
    skipStart: true,
  })

  it('should typecheck', async () => {
    const { status, stdout } = childProcess.spawnSync(
      'pnpm',
      ['tsc', '--project', 'tsconfig.json'],
      {
        cwd: next.testDir,
        encoding: 'utf-8',
      }
    )

    if (status !== 0) {
      // Piped output is incomplete and the format barely useable.
      // Printing it as a last resort in case it's not reproducible locally.
      // Best to NEXT_TEST_SKIP_CLEANUP=1 this test and run the command in the app localy.
      throw new Error('Typecheck failed: \n' + stdout)
    }
  })
})
