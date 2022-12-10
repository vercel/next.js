import promises from 'fs/promises'
import { join } from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'

jest.mock('fs/promises')

// // Allows setting mocked behavior on any prototype field of the native fs module
// const fsMock = jest.mock('fs', () => {
//   const originalFS = jest.requireActual('fs')

//   return {
//     __esModule: true,
//     ...originalFS,
//     promises: originalFS.promises,
//     __setMockImplementation: (prototypeMethod, cb, isAsync = true) => {
//       if (isAsync) {
//         this.fs.promises[prototypeMethod] = cb
//       } else {
//         this.fs[prototypeMethod] = cb
//       }
//     }
//   }
// })

// module.exports = fsMock

// jest.mock('fs', () => {
//   const originalFS = jest.requireActual('fs')

//   return {
//     __esModule: true,
//     ...originalFS,
//     promises: {
//       ...originalFS.promises,
//       writeFile: jest.fn().mockImplementation(() => {
//         console.log('gets in here')
//         throw new Error('ENOSPC')
//       })
//     },
//   }
// })

/**
 * The ENOSPC error is caused by hitting a limit on the
 *  number of "file event watchers" the native system watcher can store in memory.
 *  This error signal is thrown by inotify, used by Linux.
 * The closest we can reasonably get to mocking this behavior is
 *  to manually create this error case when we write/open
 *  a new file during `next export`.
 *
 * More info on how this error manifests and how to raise the watch limit
 *  on one's machine can be found here:
 *  https://code.visualstudio.com/docs/setup/linux#_visual-studio-code-is-unable-to-watch-for-file-changes-in-this-large-workspace-error-enospc
 */

describe('export-error-enospc', () => {
  let next: NextInstance | undefined

  afterEach(async () => {
    try {
      await next?.destroy()
    } catch (_) {}
  })

  it('should have error during next export', async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      packageJson: {
        scripts: {
          build: 'next build',
          export: 'next export',
          start: 'next start',
        },
      },
      buildCommand: 'pnpm run build',
    })

    // Must stop before export
    await next.stop()

    jest.spyOn(promises, 'writeFile').mockImplementation(() => {
      throw new Error('ENOSPC')
    })

    // Must mock other methods used in order to preserve original functionality
    // Not an automatic mock, so .unMock not available
    const unmockedFS = jest.requireActual('fs/promises')
    promises.readFile = unmockedFS.readFile
    promises.copyFile = unmockedFS.copyFile
    promises.mkdir = unmockedFS.mkdir
    promises.access = unmockedFS.access

    const exportResult = await next.export()
    console.log('export result: ', exportResult)
    expect(promises.writeFile).toHaveBeenCalledOnce()
    expect(exportResult.cliOutput).toContain(
      'There is not enough disk space to complete the export'
    )
  })
})
