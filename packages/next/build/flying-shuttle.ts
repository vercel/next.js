import Sema from 'async-sema'
import crypto from 'crypto'
import findCacheDir from 'find-cache-dir'
import fs from 'fs'
import mkdirpModule from 'mkdirp'
import { CHUNK_GRAPH_MANIFEST } from 'next-server/constants'
import { EOL } from 'os'
import path from 'path'
import { promisify } from 'util'

import { recursiveDelete } from '../lib/recursive-delete'
import * as Log from './output/log'

const FILE_BUILD_ID = 'HEAD_BUILD_ID'
const DIR_FILES_NAME = 'files'

const mkdirp = promisify(mkdirpModule)
const fsExists = promisify(fs.exists)
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const fsCopyFile = promisify(fs.copyFile)

type ChunkGraphManifest = {
  pages: { [page: string]: string[] }
  pageChunks: { [page: string]: string[] }
  chunks: { [page: string]: string[] }
  hashes: { [page: string]: string }
}

export class FlyingShuttle {
  private shuttleDirectory: string

  private buildId: string
  private pagesDirectory: string
  private distDirectory: string

  private _shuttleBuildId: string | undefined
  private _restoreSema = new Sema(1)
  private _recalledManifest: ChunkGraphManifest = {
    pages: {},
    pageChunks: {},
    chunks: {},
    hashes: {},
  }

  constructor({
    buildId,
    pagesDirectory,
    distDirectory,
  }: {
    buildId: string
    pagesDirectory: string
    distDirectory: string
  }) {
    this.shuttleDirectory = findCacheDir({
      name: 'next-flying-shuttle',
      create: true,
    })!

    this.buildId = buildId
    this.pagesDirectory = pagesDirectory
    this.distDirectory = distDirectory
  }

  hasShuttle = async () => {
    const found =
      this.shuttleBuildId &&
      (await fsExists(path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST)))

    if (found) {
      Log.info('flying shuttle is docked')
    } else {
      Log.info('could not locate flying shuttle')
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

  getUnchangedPages = async () => {
    const manifestPath = path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST)
    const manifest = require(manifestPath) as ChunkGraphManifest

    const { pages: pageFileDictionary, hashes } = manifest
    const pageNames = Object.keys(pageFileDictionary)
    const allFiles = new Set()
    pageNames.forEach(pageName =>
      pageFileDictionary[pageName].forEach(file => allFiles.add(file))
    )
    const fileChanged = new Map()
    await Promise.all(
      [...allFiles].map(async file => {
        const filePath = path.join(path.dirname(this.pagesDirectory), file)
        const exists = await fsExists(filePath)
        if (!exists) {
          fileChanged.set(file, true)
          return
        }

        // TODO: hash needs to include Next.js environment variables and packages
        const hash = crypto
          .createHash('sha1')
          .update(await fsReadFile(filePath))
          .digest('hex')
        fileChanged.set(file, hash !== hashes[file])
      })
    )

    const unchangedPages = pageNames
      .filter(
        p => !pageFileDictionary[p].map(f => fileChanged.get(f)).some(Boolean)
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
      Log.warn(`flying shuttle had no pages we can reuse`)
    }

    return unchangedPages
  }

  restorePage = async (page: string): Promise<boolean> => {
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
        `${page === '/' ? 'index' : page}.js`
      )
      const files = [serverless, ...pageChunks[page]]

      const filesExists = await Promise.all(
        files
          .map(f => path.join(this.shuttleDirectory, DIR_FILES_NAME, f))
          .map(f => fsExists(f))
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
            const recallPathExists = await fsExists(recallPath)

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
          const recallPathExists = await fsExists(recallPath)
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

  save = async () => {
    Log.wait('docking flying shuttle')

    await recursiveDelete(this.shuttleDirectory)
    await mkdirp(this.shuttleDirectory)

    const nextManifestPath = path.join(this.distDirectory, CHUNK_GRAPH_MANIFEST)
    if (!(await fsExists(nextManifestPath))) {
      Log.warn('could not find shuttle payload :: shuttle will not be docked')
      return
    }

    const nextManifest = JSON.parse(
      await fsReadFile(nextManifestPath, 'utf8')
    ) as ChunkGraphManifest
    if (nextManifest.chunks && Object.keys(nextManifest.chunks).length) {
      Log.warn('build emitted assets that cannot fit in flying shuttle')
      return
    }

    const storeManifest: ChunkGraphManifest = {
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

    const usedChunks = new Set()
    const pages = Object.keys(storeManifest.pageChunks)
    pages.forEach(page => {
      storeManifest.pageChunks[page].forEach(file => usedChunks.add(file))
      usedChunks.add(
        path.join('serverless/pages', `${page === '/' ? 'index' : page}.js`)
      )
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

    Log.info(`flying shuttle payload: ${usedChunks.size + 2} files`)
    Log.ready('flying shuttle docked')
  }
}
