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
    console.log(`no shuttle. can't detect changes`)
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
  let globalEntryChanged = false

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
    let changed = true

    // we don't need to check any further entry's dependencies if
    // a global entry changed since that invalidates everything
    if (!globalEntryChanged) {
      try {
        const traceData: {
          fileHashes: Record<string, string>
        } = JSON.parse(await fs.promises.readFile(traceFile, 'utf8'))

        if (traceData) {
          let changedDependency = false
          await Promise.all(
            Object.keys(traceData.fileHashes).map(async (file) => {
              try {
                if (changedDependency) return
                await hashSema.acquire()
                const relativeTraceFile = path.relative(
                  path.join(shuttleDir, 'server', type),
                  traceFile
                )
                const originalTraceFile = path.join(
                  distDir,
                  'server',
                  type,
                  relativeTraceFile
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
                  console.log('detected change on', {
                    prevHash,
                    curHash,
                    file,
                    entry: normalizedEntry,
                  })
                  changedDependency = true
                }
              } finally {
                hashSema.release()
              }
            })
          )

          if (!changedDependency) {
            changed = false
          }
        } else {
          console.error('missing trace data', traceFile, normalizedEntry)
        }
      } catch (err) {
        console.error(`Failed to detect change for ${entry}`, err)
      }
    }

    // we always rebuild global entries so we have a version
    // that matches the newest build/runtime
    const isGlobalEntry = /(_app|_document|_error)/.test(entry)

    if (changed || isGlobalEntry) {
      // if a global entry changed all entries are changed
      if (!globalEntryChanged && isGlobalEntry) {
        console.log(`global entry ${entry} changed invalidating all entries`)
        globalEntryChanged = true
        // move unchanged to changed
        changedEntries[type].push(...unchangedEntries[type])
      }
      changedEntries[type].push(entry)
    } else {
      unchangedEntries[type].push(entry)
    }
  }

  // loop over entries and their dependency's hashes
  // to detect which changed
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

  console.log(
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
