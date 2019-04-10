import crypto from 'crypto'
import findCacheDir from 'find-cache-dir'
import fs from 'fs'
import mkdirpModule from 'mkdirp'
import { CHUNK_GRAPH_MANIFEST } from 'next-server/constants'
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
    const found = await promisify(fs.exists)(
      path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST)
    )

    if (found) {
      Log.info('flying shuttle is docked')
    } else {
      Log.info('could not locate flying shuttle')
    }

    return found
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
      Log.info(`found ${u} unchanged page${u > 1 ? 's' : ''}`)
    }

    return unchangedPages
  }

  restorePage = async (page: string): Promise<boolean> => {
    return false
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

    const manifest = JSON.parse(
      await fsReadFile(nextManifestPath, 'utf8')
    ) as ChunkGraphManifest
    if (manifest.chunks && Object.keys(manifest.chunks).length) {
      Log.warn('build emitted assets that cannot fit in flying shuttle')
      return
    }

    const usedChunks = new Set()
    const pages = Object.keys(manifest.pageChunks)
    pages.forEach(page => {
      manifest.pageChunks[page].forEach(file => usedChunks.add(file))
      usedChunks.add(
        path.join('serverless/pages', `${page === '/' ? 'index' : page}.js`)
      )
    })
    await fsCopyFile(
      nextManifestPath,
      path.join(this.shuttleDirectory, CHUNK_GRAPH_MANIFEST)
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
    await fsWriteFile(
      path.join(this.shuttleDirectory, FILE_BUILD_ID),
      this.buildId
    )

    Log.info(`flying shuttle payload: ${usedChunks.size + 2} files`)
    Log.ready('flying shuttle docked')
  }
}
