import { readFileSync } from 'fs'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { retry } from 'next-test-utils'
import startWatching from '../../packages/next/taskfile'

const requireFromNext = createRequire(
  join(__dirname, '../../packages/next/package.json')
)
const Watchpack = requireFromNext('watchpack')

describe('Switchyard watch build', () => {
  it('rebuilds Switchyard after its Go source changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchyard-watch-'))
    const source = join(directory, 'src/server/switchyard/main.go')
    const watcher = new Watchpack({ aggregateTimeout: 5, poll: 10 })
    const rebuilt = jest.fn()
    try {
      await mkdir(join(directory, 'src/server/switchyard'), { recursive: true })
      await writeFile(source, 'original source')
      watcher.on('aggregated', () => {
        rebuilt(readFileSync(source, 'utf8'))
      })

      // Exercise the watch directories registered by the real taskfile. The
      // build is stubbed so this only needs Watchpack, without requiring Go.
      await startWatching({
        clear: async () => {},
        start: async () => {},
        watch: async (path: string, names: string | string[]) => {
          if ([names].flat().includes('switchyard')) {
            watcher.watch({
              directories: [join(directory, path)],
              startTime: Date.now() - 10000,
            })
          }
        },
      })

      // Watchpack also reports its initial scan (including a missing watch
      // directory). Only a later source edit should satisfy the assertion.
      await retry(() => {
        expect(rebuilt).toHaveBeenCalledWith('original source')
      })
      rebuilt.mockClear()
      await retry(async () => {
        await writeFile(source, 'updated source')
        expect(rebuilt).toHaveBeenCalledWith('updated source')
      })
    } finally {
      watcher.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
