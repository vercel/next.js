import { Sema } from 'async-sema'
import crypto from 'crypto'
import fs from 'fs'
import mkdirpModule from 'mkdirp'
import { CHUNK_GRAPH_MANIFEST } from 'next-server/constants'
import { EOL } from 'os'
import path from 'path'
import { promisify } from 'util'

import { recursiveDelete } from '../lib/recursive-delete'
import { fileExists } from '../lib/file-exists'
import * as Log from './output/log'
import { PageInfo } from './utils'

const FILE_BUILD_ID = 'HEAD_BUILD_ID'
const FILE_UPDATED_AT = 'UPDATED_AT'
const DIR_FILES_NAME = 'files'
const MAX_SHUTTLES = 3

const mkdirp = promisify(mkdirpModule)
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const fsCopyFile = promisify(fs.copyFile)
const fsReadDir = promisify(fs.readdir)
const fsLstat = promisify(fs.lstat)

type ChunkGraphManifest = {
  sharedFiles: string[] | undefined
  pages: { [page: string]: string[] }
  pageChunks: { [page: string]: string[] }
  chunks: { [page: string]: string[] }
  hashes: { [page: string]: string }
}

async function findCachedShuttles(apexShuttleDirectory: string) {
  return (await Promise.all(
    await fsReadDir(apexShuttleDirectory).then(shuttleFiles =>
      shuttleFiles.map(async f => ({
        file: f,
        stats: await fsLstat(path.join(apexShuttleDirectory, f)),
      }))
    )
  ))
    .filter(({ stats }) => stats.isDirectory())
    .map(({ file }) => file)
}

async function pruneShuttles(apexShuttleDirectory: string) {
  const allShuttles = await findCachedShuttles(apexShuttleDirectory)
  if (allShuttles.length <= MAX_SHUTTLES) {
    return
  }

  const datedShuttles: { updatedAt: Date; shuttleDirectory: string }[] = []
  for (const shuttleId of allShuttles) {
    const shuttleDirectory = path.join(apexShuttleDirectory, shuttleId)
    const updatedAtPath = path.join(shuttleDirectory, FILE_UPDATED_AT)

    let updatedAt: Date
    try {
      updatedAt = new Date((await fsReadFile(updatedAtPath, 'utf8')).trim())
    } catch (err) {
      if (err.code === 'ENOENT') {
        await recursiveDelete(shuttleDirectory)
        continue
      }
      throw err
    }

    datedShuttles.push({ updatedAt, shuttleDirectory })
  }

  const sortedShuttles = datedShuttles.sort((a, b) =>
    Math.sign(b.updatedAt.valueOf() - a.updatedAt.valueOf())
  )
  let prunedShuttles = 0
  while (sortedShuttles.length > MAX_SHUTTLES) {
    const shuttleDirectory = sortedShuttles.pop()
    await recursiveDelete(shuttleDirectory!.shuttleDirectory)
    ++prunedShuttles
  }

  if (prunedShuttles) {
    Log.info(
      `decommissioned ${prunedShuttles} old shuttle${
        prunedShuttles > 1 ? 's' : ''
      }`
    )
  }
}

function isShuttleValid({
  manifestPath,
  pagesDirectory,
  parentCacheIdentifier,
}: {
  manifestPath: string
  pagesDirectory: string
  parentCacheIdentifier: string
}) {
  const manifest = require(manifestPath) as ChunkGraphManifest
  const { sharedFiles, hashes } = manifest
  if (!sharedFiles) {
    return false
  }

  return !sharedFiles
    .map(file => {
      const filePath = path.join(path.dirname(pagesDirectory), file)
      const exists = fs.existsSync(filePath)
      if (!exists) {
        return true
      }

      const hash = crypto
        .createHash('sha1')
        .update(parentCacheIdentifier)
        .update(fs.readFileSync(filePath))
        .digest('hex')
      return hash !== hashes[file]
    })
    .some(Boolean)
}

export class FlyingShuttle {
  private apexShuttleDirectory: string
  private flyingShuttleId: string

  private buildId: string
  private pagesDirectory: string
  private distDirectory: string
  private parentCacheIdentifier: string

  private _shuttleBuildId: string | undefined
  private _restoreSema = new Sema(1)
  private _recalledManifest: ChunkGraphManifest = {
    sharedFiles: [],
    pages: {},
    pageChunks: {},
    chunks: {},
    hashes: {},
  }

  constructor({
    buildId,
    pagesDirectory,
    distDirectory,
    cacheIdentifier,
  }: {
    buildId: string
    pagesDirectory: string
    distDirectory: string
    cacheIdentifier: string
  }) {
    mkdirpModule.sync(
      (this.apexShuttleDirectory = path.join(
        distDirectory,
        'cache',
        'next-flying-shuttle'
      ))
    )
    this.flyingShuttleId = crypto.randomBytes(16).toString('hex')

    this.buildId = buildId
    this.pagesDirectory = pagesDirectory
    this.distDirectory = distDirectory
    this.parentCacheIdentifier = cacheIdentifier
  }

  get shuttleDirectory() {
    return path.join(this.apexShuttleDirectory, this.flyingShuttleId)
  }

  private findShuttleId = async () => {
    const shuttles = await findCachedShuttles(this.apexShuttleDirectory)
    return shuttles.find(shuttleId => {
      try {
        const manifestPath = path.join(
          this.apexShuttleDirectory,
          shuttleId,
          CHUNK_GRAPH_MANIFEST
        )
        return isShuttleValid({
          manifestPath,
          pagesDirectory: this.pagesDirectory,
          parentCacheIdentifier: this.parentCacheIdentifier,
        })
      } catch (_) {}
      return false
    })
  }

  hasShuttle = async () => {
    const existingFlyingShuttleId = await this.findShuttleId()
    this.flyingShuttleId = existingFlyingShuttleId || this.flyingShuttleId

    const found =
      this.shuttleBuildId &&
      (await fileExists(path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST)))

    if (found) {
      Log.info('flying shuttle is docked')
    }

    return found
  }

  get shuttleBuildId() {
    if (this._shuttleBuildId) {
      return this._shuttleBuildId
    }

    const headBuildIdPath = path.join(this.shuttleDirectory, FILE_BUILD_ID)
    if (!fs.existsSync(headBuildIdPath)) {
      return (this._shuttleBuildId = undefined)
    }

    const contents = fs.readFileSync(headBuildIdPath, 'utf8').trim()
    return (this._shuttleBuildId = contents)
  }

  getPageInfos = async (): Promise<Map<string, PageInfo>> => {
    const pageInfos: Map<string, PageInfo> = new Map()
    const pagesManifest = JSON.parse(
      await fsReadFile(
        path.join(
          this.shuttleDirectory,
          DIR_FILES_NAME,
          'serverless/pages-manifest.json'
        ),
        'utf8'
      )
    )
    Object.keys(pagesManifest).forEach(pg => {
      const path = pagesManifest[pg]
      const isStatic: boolean = path.endsWith('html')
      let isAmp = Boolean(pagesManifest[pg + '.amp'])
      if (pg === '/') isAmp = Boolean(pagesManifest['/index.amp'])
      pageInfos.set(pg, {
        isAmp,
        size: 0,
        static: isStatic,
        serverBundle: path,
      })
    })
    return pageInfos
  }

  getUnchangedPages = async () => {
    const manifestPath = path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST)
    const manifest = require(manifestPath) as ChunkGraphManifest

    const { sharedFiles, pages: pageFileDictionary, hashes } = manifest
    const pageNames = Object.keys(pageFileDictionary)
    const allFiles = new Set(sharedFiles)
    pageNames.forEach(pageName =>
      pageFileDictionary[pageName].forEach(file => allFiles.add(file))
    )
    const fileChanged = new Map()
    await Promise.all(
      [...allFiles].map(async file => {
        const filePath = path.join(path.dirname(this.pagesDirectory), file)
        const exists = await fileExists(filePath)
        if (!exists) {
          fileChanged.set(file, true)
          return
        }

        const hash = crypto
          .createHash('sha1')
          .update(this.parentCacheIdentifier)
          .update(await fsReadFile(filePath))
          .digest('hex')
        fileChanged.set(file, hash !== hashes[file])
      })
    )

    const unchangedPages = (sharedFiles || [])
      .map(f => fileChanged.get(f))
      .some(Boolean)
      ? []
      : pageNames
          .filter(
            p =>
              !pageFileDictionary[p].map(f => fileChanged.get(f)).some(Boolean)
          )
          .filter(
            pageName =>
              pageName !== '/_app' &&
              pageName !== '/_error' &&
              pageName !== '/_document'
          )

    if (unchangedPages.length) {
      const u = unchangedPages.length
      const c = pageNames.length - u
      Log.info(`found ${c} changed and ${u} unchanged page${u > 1 ? 's' : ''}`)
    } else {
      Log.warn(
        `flying shuttle is going to perform a full rebuild due to changes across all pages`
      )
    }

    return unchangedPages
  }

  mergePagesManifest = async (): Promise<void> => {
    const savedPagesManifest = path.join(
      this.shuttleDirectory,
      DIR_FILES_NAME,
      'serverless/pages-manifest.json'
    )
    if (!(await fileExists(savedPagesManifest))) return

    const saved = JSON.parse(await fsReadFile(savedPagesManifest, 'utf8'))
    const currentPagesManifest = path.join(
      this.distDirectory,
      'serverless/pages-manifest.json'
    )
    const current = JSON.parse(await fsReadFile(currentPagesManifest, 'utf8'))

    await fsWriteFile(
      currentPagesManifest,
      JSON.stringify({
        ...saved,
        ...current,
      })
    )
  }

  restorePage = async (
    page: string,
    pageInfo: PageInfo = {} as PageInfo
  ): Promise<boolean> => {
    await this._restoreSema.acquire()

    try {
      const manifestPath = path.join(
        this.shuttleDirectory,
        CHUNK_GRAPH_MANIFEST
      )
      const manifest = require(manifestPath) as ChunkGraphManifest

      const { pages, pageChunks, hashes } = manifest
      if (!(pages.hasOwnProperty(page) && pageChunks.hasOwnProperty(page))) {
        Log.warn(`unable to find ${page} in shuttle`)
        return false
      }

      const serverless = path.join(
        'serverless/pages',
        `${page === '/' ? 'index' : page}.${pageInfo.static ? 'html' : 'js'}`
      )
      const files = [serverless, ...pageChunks[page]]
      const filesExists = await Promise.all(
        files
          .map(f => path.join(this.shuttleDirectory, DIR_FILES_NAME, f))
          .map(f => fileExists(f))
      )
      if (!filesExists.every(Boolean)) {
        Log.warn(`unable to locate files for ${page} in shuttle`)
        return false
      }

      const rewriteRegex = new RegExp(`${this.shuttleBuildId}[\\/\\\\]`)
      const movedPageChunks: string[] = []
      await Promise.all(
        files.map(async recallFileName => {
          if (!rewriteRegex.test(recallFileName)) {
            const recallPath = path.join(this.distDirectory, recallFileName)
            const recallPathExists = await fileExists(recallPath)

            if (!recallPathExists) {
              await mkdirp(path.dirname(recallPath))
              await fsCopyFile(
                path.join(
                  this.shuttleDirectory,
                  DIR_FILES_NAME,
                  recallFileName
                ),
                recallPath
              )
            }

            movedPageChunks.push(recallFileName)
            return
          }

          const newFileName = recallFileName.replace(
            rewriteRegex,
            `${this.buildId}/`
          )
          const recallPath = path.join(this.distDirectory, newFileName)
          const recallPathExists = await fileExists(recallPath)
          if (!recallPathExists) {
            await mkdirp(path.dirname(recallPath))
            await fsCopyFile(
              path.join(this.shuttleDirectory, DIR_FILES_NAME, recallFileName),
              recallPath
            )
          }
          movedPageChunks.push(newFileName)
        })
      )

      this._recalledManifest.pages[page] = pages[page]
      this._recalledManifest.pageChunks[page] = movedPageChunks.filter(
        f => f !== serverless
      )
      this._recalledManifest.hashes = Object.assign(
        {},
        this._recalledManifest.hashes,
        pages[page].reduce(
          (acc, cur) => Object.assign(acc, { [cur]: hashes[cur] }),
          {}
        )
      )
      return true
    } finally {
      this._restoreSema.release()
    }
  }

  save = async (staticPages: Set<string>, pageInfos: Map<string, PageInfo>) => {
    Log.wait('docking flying shuttle')

    await recursiveDelete(this.shuttleDirectory)
    await mkdirp(this.shuttleDirectory)

    const nextManifestPath = path.join(this.distDirectory, CHUNK_GRAPH_MANIFEST)
    if (!(await fileExists(nextManifestPath))) {
      Log.warn('could not find shuttle payload :: shuttle will not be docked')
      return
    }

    const nextManifest = JSON.parse(
      await fsReadFile(nextManifestPath, 'utf8')
    ) as ChunkGraphManifest

    const storeManifest: ChunkGraphManifest = {
      // Intentionally does not merge with the recalled manifest
      sharedFiles: nextManifest.sharedFiles,
      pages: Object.assign(
        {},
        this._recalledManifest.pages,
        nextManifest.pages
      ),
      pageChunks: Object.assign(
        {},
        this._recalledManifest.pageChunks,
        nextManifest.pageChunks
      ),
      chunks: Object.assign(
        {},
        this._recalledManifest.chunks,
        nextManifest.chunks
      ),
      hashes: Object.assign(
        {},
        this._recalledManifest.hashes,
        nextManifest.hashes
      ),
    }

    await fsWriteFile(
      path.join(this.shuttleDirectory, FILE_BUILD_ID),
      this.buildId
    )
    await fsWriteFile(
      path.join(this.shuttleDirectory, FILE_UPDATED_AT),
      new Date().toISOString()
    )

    const usedChunks = new Set<string>()
    const pages = Object.keys(storeManifest.pageChunks)
    pages.forEach(page => {
      const info = pageInfos.get(page) || ({} as PageInfo)

      storeManifest.pageChunks[page].forEach((file, idx) => {
        if (info.isAmp) {
          // AMP pages don't have client bundles
          storeManifest.pageChunks[page] = []
          return
        }
        usedChunks.add(file)
      })
      usedChunks.add(
        path.join(
          'serverless/pages',
          `${page === '/' ? 'index' : page}.${
            staticPages.has(page) ? 'html' : 'js'
          }`
        )
      )
      const ampPage = (page === '/' ? '/index' : page) + '.amp'

      if (staticPages.has(ampPage)) {
        storeManifest.pages[ampPage] = []
        storeManifest.pageChunks[ampPage] = []
        usedChunks.add(path.join('serverless/pages', `${ampPage}.html`))
      }
    })

    await fsWriteFile(
      path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST),
      JSON.stringify(storeManifest, null, 2) + EOL
    )

    await Promise.all(
      [...usedChunks].map(async usedChunk => {
        const target = path.join(
          this.shuttleDirectory,
          DIR_FILES_NAME,
          usedChunk
        )
        await mkdirp(path.dirname(target))
        return fsCopyFile(path.join(this.distDirectory, usedChunk), target)
      })
    )

    await fsCopyFile(
      path.join(this.distDirectory, 'serverless/pages-manifest.json'),
      path.join(
        this.shuttleDirectory,
        DIR_FILES_NAME,
        'serverless/pages-manifest.json'
      )
    )

    Log.info(`flying shuttle payload: ${usedChunks.size + 2} files`)
    Log.ready('flying shuttle docked')

    try {
      await pruneShuttles(this.apexShuttleDirectory)
    } catch (e) {
      Log.error('failed to prune old shuttles: ' + e)
    }
  }
}
