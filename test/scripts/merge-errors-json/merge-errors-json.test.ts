import { mkdtempSync, rmSync } from 'fs'
import { writeJSONSync, readJSONSync } from 'fs-extra'
import { join } from 'path'
import { tmpdir } from 'os'
import execa from 'execa'

describe('merge-errors-json driver', () => {
  it('should correctly merge errors.json files with conflicting new entries', async () => {
    const base = {
      '1': 'Original message 1',
      '2': 'Original message 2',
    }
    const current = {
      ...base,
      '3': 'From a conflicting branch that was merged first 1',
      '4': 'From a conflicting branch that was merged first 2',
    }
    const rebased = await simulateRebase({
      base,
      current,
      incoming: {
        ...base,
        '3': 'From our branch 1',
        '4': 'From our branch 2',
      },
    })
    expect(rebased).toEqual({
      ...current,
      '5': 'From our branch 1',
      '6': 'From our branch 2',
    })
  })

  it('should handle empty base file', async () => {
    const base = {}
    const current = {
      '1': 'Message from a conflicting branch that was merged first',
    }
    const rebased = await simulateRebase({
      base,
      current,
      incoming: { '1': 'New message from our branch' },
    })
    expect(rebased).toEqual({
      ...current,
      '2': 'New message from our branch',
    })
  })

  it('should handle stacked PRs', async () => {
    const base = {
      '1': 'Original message 1',
      '2': 'Original message 2',
    }
    const current = {
      ...base,
      '3': 'Message from a conflicting branch that was merged first',
    }
    const ourBranch1 = {
      ...base,
      '3': 'New message from our-branch-1',
    }
    const ourBranch2 = {
      ...ourBranch1,
      '4': 'New message from our-branch-2', // will conflict after our-branch-1 is rebased and its error is renumbered to 4
    }

    const branch1Rebased = await simulateRebase({
      base: base,
      current: current,
      incoming: ourBranch1,
    })
    expect(branch1Rebased).toEqual({
      ...current,
      '4': 'New message from our-branch-1',
    })

    const branch2Rebased = await simulateRebase({
      base: ourBranch1,
      current: branch1Rebased,
      incoming: ourBranch2,
    })
    expect(branch2Rebased).toEqual({
      ...branch1Rebased,
      '5': 'New message from our-branch-2',
    })
  })
})

type Contents = Record<string, string>

async function simulateRebase({
  base,
  current,
  incoming,
}: {
  base: Contents
  current: Contents
  incoming: Contents
}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'merge-driver-test-'))

  const paths = {
    base: join(tempDir, 'base.json'),
    current: join(tempDir, 'current.json'),
    other: join(tempDir, 'other.json'),
  }

  writeJSONSync(paths.base, base, { spaces: 2 })
  // during a rebase, the branch we're rebasing onto will be "current", and our commit will be "other"
  writeJSONSync(paths.current, current, { spaces: 2 })
  writeJSONSync(paths.other, incoming, { spaces: 2 })

  await execa('node', [
    'scripts/merge-errors-json/merge.mjs',
    paths.current,
    paths.base,
    paths.other,
  ])

  const result = readJSONSync(paths.current)
  rmSync(tempDir, { recursive: true, force: true })
  return result
}
