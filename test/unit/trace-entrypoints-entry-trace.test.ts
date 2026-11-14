/* eslint-env jest */
import path from 'path'
import {
  createEntryTrace,
  getFilesMapFromReasons,
} from 'next/dist/build/webpack/plugins/next-trace-entrypoints-plugin'

type Reasons = Map<
  string,
  { type: string[]; ignored: boolean; parents: Set<string> }
>

// Native paths, like the ones the plugin computes with `path.relative`.
const tracingRoot = path.resolve('/project')
const rel = (file: string) => path.join(...file.split('/'))
const abs = (file: string) => path.join(tracingRoot, rel(file))

/**
 * Reference implementation: the per-entry trace computation that
 * `TraceEntryPointsPlugin` used before it stopped materializing every
 * (bundled file x entry) pair. Returns the files that end up in the entry's
 * `.nft.json` (before making them relative to the output directory).
 */
function referenceIncludedFiles({
  fileList,
  reasons,
  isIgnored,
  entry,
  extraEntries,
  entryFiles,
}: {
  fileList: Set<string>
  reasons: Reasons
  isIgnored: (file: string) => boolean
  entry: string
  extraEntries: string[]
  entryFiles: string[]
}): string[] {
  const parentFilesMap = new Map<string, Map<string, { ignored: boolean }>>()
  function propagateToParents(
    parents: Set<string>,
    file: string,
    seen = new Set<string>()
  ) {
    for (const parent of parents || []) {
      if (!seen.has(parent)) {
        seen.add(parent)
        let parentFiles = parentFilesMap.get(parent)
        if (!parentFiles) {
          parentFiles = new Map()
          parentFilesMap.set(parent, parentFiles)
        }
        parentFiles.set(file, { ignored: Boolean(isIgnored(file)) })
        const parentReason = reasons.get(parent)
        if (parentReason?.parents) {
          propagateToParents(parentReason.parents, file, seen)
        }
      }
    }
  }
  for (const file of fileList) {
    const reason = reasons.get(file)
    const isInitial =
      reason?.type.length === 1 && reason.type.includes('initial')
    if (
      !reason ||
      !reason.parents ||
      (isInitial && reason.parents.size === 0)
    ) {
      continue
    }
    propagateToParents(reason.parents, file)
  }

  const finalDeps = new Map<string, { bundled: boolean }>()
  finalDeps.set(entry, { bundled: true })
  for (const [dep, info] of parentFilesMap
    .get(path.relative(tracingRoot, entry))
    ?.entries() || []) {
    finalDeps.set(path.join(tracingRoot, dep), { bundled: info.ignored })
  }
  for (const extraEntry of extraEntries) {
    finalDeps.set(extraEntry, { bundled: false })
    for (const [dep, info] of parentFilesMap
      .get(path.relative(tracingRoot, extraEntry))
      ?.entries() || []) {
      finalDeps.set(path.join(tracingRoot, dep), { bundled: info.ignored })
    }
  }

  const included: string[] = []
  for (const file of new Set([...entryFiles, ...finalDeps.keys()])) {
    if (!finalDeps.get(file)?.bundled) included.push(file)
  }
  return included
}

function newIncludedFiles(opts: Parameters<typeof referenceIncludedFiles>[0]) {
  const ignoredFiles = new Set<string>()
  const parentFilesMap = getFilesMapFromReasons(
    opts.fileList,
    opts.reasons as any,
    opts.isIgnored,
    { skipIgnored: true, ignoredFiles }
  )
  const trace = createEntryTrace({
    tracingRoot,
    entry: opts.entry,
    extraEntries: opts.extraEntries,
    parentFilesMap,
    fileList: opts.fileList,
    reasons: opts.reasons as any,
    ignoredFiles,
  })
  const included: string[] = []
  for (const file of new Set([...opts.entryFiles, ...trace.files()])) {
    if (!trace.isBundled(file)) included.push(file)
  }
  return included
}

// Small deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomCase(seed: number) {
  const rand = mulberry32(seed)
  const fileCount = 4 + Math.floor(rand() * 20)
  const files = Array.from({ length: fileCount }, (_, i) => rel(`src/f${i}.js`))
  const reasons: Reasons = new Map()
  const rootCount = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < fileCount; i++) {
    const parents = new Set<string>()
    if (i >= rootCount) {
      const parentCount = 1 + Math.floor(rand() * 3)
      for (let p = 0; p < parentCount; p++) {
        // Mostly acyclic, with the occasional back edge.
        const j =
          rand() < 0.1 ? Math.floor(rand() * fileCount) : Math.floor(rand() * i)
        if (j !== i || rand() < 0.5) parents.add(files[j])
      }
    }
    const type =
      i < rootCount ? ['initial'] : rand() < 0.2 ? ['asset'] : ['dependency']
    // Some files are traced without a reason entry.
    if (rand() < 0.05) continue
    reasons.set(files[i], { type, ignored: false, parents })
  }
  const fileList = new Set(files.filter(() => rand() < 0.95))
  const ignored = new Set(files.filter(() => rand() < 0.6))
  const pick = () => files[Math.floor(rand() * fileCount)]
  const entry = abs(files[0])
  const extraEntries: string[] = []
  const extraCount = Math.floor(rand() * 4)
  for (let i = 0; i < extraCount; i++) {
    extraEntries.push(abs(rand() < 0.3 ? files[0] : pick()))
  }
  const entryFiles = [abs('.next/server/chunks/1.js')]
  const emittedCount = Math.floor(rand() * 3)
  for (let i = 0; i < emittedCount; i++) entryFiles.push(abs(pick()))
  return {
    fileList,
    reasons,
    isIgnored: (file: string) => ignored.has(file),
    entry,
    extraEntries,
    entryFiles,
  }
}

describe('TraceEntryPointsPlugin entry traces', () => {
  it('include the same files as the reference implementation', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const testCase = randomCase(seed)
      expect([seed, newIncludedFiles(testCase).sort()]).toEqual([
        seed,
        referenceIncludedFiles(testCase).sort(),
      ])
    }
  })

  it('handles extra entries that are bundled dependencies of later roots', () => {
    const reasons: Reasons = new Map([
      [
        rel('src/page.js'),
        { type: ['initial'], ignored: false, parents: new Set() },
      ],
      [
        rel('src/a.js'),
        { type: ['initial'], ignored: false, parents: new Set() },
      ],
      [
        rel('src/b.js'),
        {
          type: ['dependency'],
          ignored: false,
          parents: new Set([rel('src/c.js')]),
        },
      ],
      [
        rel('src/c.js'),
        { type: ['initial'], ignored: false, parents: new Set() },
      ],
      [
        rel('node_modules/x/index.js'),
        {
          type: ['dependency'],
          ignored: false,
          parents: new Set([rel('src/b.js')]),
        },
      ],
    ])
    const testCase = {
      fileList: new Set([...reasons.keys()]),
      reasons,
      isIgnored: (file: string) => file.startsWith(rel('src') + path.sep),
      entry: abs('src/page.js'),
      extraEntries: [abs('src/b.js'), abs('src/c.js')],
      entryFiles: [abs('.next/server/app/page.js'), abs('src/b.js')],
    }
    const expected = referenceIncludedFiles(testCase).sort()
    expect(expected).toEqual(
      [
        abs('.next/server/app/page.js'),
        abs('node_modules/x/index.js'),
        abs('src/c.js'),
      ].sort()
    )
    expect(newIncludedFiles(testCase).sort()).toEqual(expected)
  })

  it('does not record ignored files when skipIgnored is set', () => {
    const reasons: Reasons = new Map([
      [
        rel('src/page.js'),
        { type: ['initial'], ignored: false, parents: new Set() },
      ],
      [
        rel('src/comp.js'),
        {
          type: ['dependency'],
          ignored: false,
          parents: new Set([rel('src/page.js')]),
        },
      ],
      [
        rel('node_modules/react/index.js'),
        {
          type: ['dependency'],
          ignored: false,
          parents: new Set([rel('src/comp.js')]),
        },
      ],
    ])
    const fileList = new Set([...reasons.keys()])
    const isIgnored = jest.fn((file: string) =>
      file.startsWith(rel('src') + path.sep)
    )
    const ignoredFiles = new Set<string>()
    const map = getFilesMapFromReasons(fileList, reasons as any, isIgnored, {
      skipIgnored: true,
      ignoredFiles,
    })
    expect(
      Object.fromEntries([...map].map(([k, v]) => [k, [...v.keys()]]))
    ).toEqual({
      [rel('src/page.js')]: [rel('node_modules/react/index.js')],
      [rel('src/comp.js')]: [rel('node_modules/react/index.js')],
    })
    expect([...ignoredFiles]).toEqual([rel('src/comp.js')])
    // Called once per traced file, not once per (file, parent) pair.
    expect(isIgnored).toHaveBeenCalledTimes(2)
  })

  it('keeps the default behavior without skipIgnored', () => {
    const reasons: Reasons = new Map([
      [
        rel('src/page.js'),
        { type: ['initial'], ignored: false, parents: new Set() },
      ],
      [
        rel('src/comp.js'),
        {
          type: ['dependency'],
          ignored: false,
          parents: new Set([rel('src/page.js')]),
        },
      ],
    ])
    const isIgnored = jest.fn(() => true)
    const map = getFilesMapFromReasons(
      new Set(reasons.keys()),
      reasons as any,
      isIgnored
    )
    expect(map.get(rel('src/page.js'))?.get(rel('src/comp.js'))).toEqual({
      ignored: true,
    })
    expect(isIgnored).toHaveBeenCalledWith(
      rel('src/comp.js'),
      rel('src/page.js')
    )
  })
})
