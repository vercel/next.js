import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'

// Only Turbopack's production chunking hashes chunk content into chunk paths
// (`ContentHashing::Direct`), which is what closes the reference cycle here.
;(shouldUseTurbopack() ? describe : describe.skip)(
  'turbopack-worker-self-reference',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })

    // `app/worker.js` spawns another instance of itself, so the emitted worker
    // chunk embeds the file names of its own chunk group. With content-hashed
    // chunk paths the chunk's path awaits the chunk's content while the content
    // awaits the path, which is an await cycle turbo-tasks cannot detect: the
    // build used to park forever at "Creating an optimized production build ..."
    // at 0% CPU, so a regression shows up as a hanging (timed out) build here.
    it('builds an app with a web worker that spawns itself', async () => {
      const { exitCode } = await next.build()

      expect(exitCode).toBe(0)
    })
  }
)
