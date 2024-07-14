import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getPageFromPath } from '../entries'
import { Sema } from 'next/dist/compiled/async-sema'

export interface DetectedEntriesResult {
  app: string[]
  pages: string[]
}

let _hasShuttle: undefined | boolean = undefined
export async function hasShuttle(shuttleDir: string) {
  if (typeof _hasShuttle === 'boolean') {
    return _hasShuttle
  }
  _hasShuttle = await fs.promises
    .access(path.join(shuttleDir, 'server'))
    .then(() => true)
    .catch(() => false)

  return _hasShuttle
}

export async function detectChangedEntries({
  appPaths,
  pagesPaths,
  pageExtensions,
  distDir,
  shuttleDir,
}: {
  appPaths?: string[]
  pagesPaths?: string[]
  pageExtensions: string[]
  distDir: string
  shuttleDir: string
}): Promise<{
  changed: DetectedEntriesResult
  unchanged: DetectedEntriesResult
}> {
  const changedEntries: {
    app: string[]
    pages: string[]
  } = {
    app: [],
    pages: [],
  }
  const unchangedEntries: typeof changedEntries = {
    app: [],
    pages: [],
  }

  if (!(await hasShuttle(shuttleDir))) {
    // no shuttle so consider everything changed
    console.log('no shuttle can not detect changes')
    return {
      changed: {
        pages: pagesPaths || [],
        app: appPaths || [],
      },
      unchanged: {
        pages: [],
        app: [],
      },
    }
  }

  const hashCache = new Map<string, string>()

  async function computeHash(p: string): Promise<string> {
    let hash = hashCache.get(p)
    if (hash) {
      return hash
    }
    return new Promise((resolve, reject) => {
      const hashInst = crypto.createHash('sha1')
      const stream = fs.createReadStream(p)
      stream.on('error', (err) => reject(err))
      stream.on('data', (chunk) => hashInst.update(chunk))
      stream.on('end', () => {
        const digest = hashInst.digest('hex')
        resolve(digest)
        hashCache.set(p, digest)
      })
    })
  }

  const hashSema = new Sema(16)

  async function detectChange({
    normalizedEntry,
    entry,
    type,
  }: {
    entry: string
    normalizedEntry: string
    type: keyof typeof changedEntries
  }) {
    const traceFile = path.join(
      shuttleDir,
      'server',
      type,
      `${normalizedEntry}.js.nft.json`
    )

    const traceData:
      | false
      | {
          fileHashes: Record<string, string>
        } = JSON.parse(
      await fs.promises
        .readFile(traceFile, 'utf8')
        .catch(() => JSON.stringify(false))
    )
    let changed = false

    if (traceData) {
      await Promise.all(
        Object.keys(traceData.fileHashes).map(async (file) => {
          if (changed) return
          try {
            await hashSema.acquire()
            const originalTraceFile = path.join(
              distDir,
              'server',
              type,
              path.relative(path.join(shuttleDir, 'server', type), traceFile)
            )
            const absoluteFile = path.join(
              path.dirname(originalTraceFile),
              file
            )

            if (absoluteFile.startsWith(distDir)) {
              return
            }

            const prevHash = traceData.fileHashes[file]
            const curHash = await computeHash(absoluteFile)

            if (prevHash !== curHash) {
              console.error('detected change on', {
                prevHash,
                curHash,
                file,
                entry: normalizedEntry,
              })
              changed = true
            }
          } finally {
            hashSema.release()
          }
        })
      )
    } else {
      console.error('missing trace data', traceFile, normalizedEntry)
      changed = true
    }

    if (changed || entry.match(/(_app|_document|_error)/)) {
      changedEntries[type].push(entry)
    } else {
      unchangedEntries[type].push(entry)
    }
  }

  // collect page entries with default page extensions
  console.error(
    JSON.stringify(
      {
        appPaths,
        pagePaths: pagesPaths,
      },
      null,
      2
    )
  )
  // loop over entries and their dependency's hashes to find
  // which changed

  // TODO: if _app or _document change it invalidates all pages
  for (const entry of pagesPaths || []) {
    let normalizedEntry = getPageFromPath(entry, pageExtensions)

    if (normalizedEntry === '/') {
      normalizedEntry = '/index'
    }

    await detectChange({ entry, normalizedEntry, type: 'pages' })
  }

  for (const entry of appPaths || []) {
    const normalizedEntry = getPageFromPath(entry, pageExtensions)
    await detectChange({ entry, normalizedEntry, type: 'app' })
  }

  console.error(
    'changed entries',
    JSON.stringify(
      {
        changedEntries,
        unchangedEntries,
      },
      null,
      2
    )
  )

  return {
    changed: changedEntries,
    unchanged: unchangedEntries,
  }
}
