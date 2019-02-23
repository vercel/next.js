import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const readdir = promisify(fs.readdir)
const stat = promisify(fs.stat)
type filterCallback = (path: string) => boolean

const getFilesFrom = async (dir: string, only: RegExp) => readDir(dir, dir, only)

const readDir = async (dir: string, rel: string, only: RegExp) => {
  const allFiles: string[] = []
  const elements = ((await readdir(dir)).map((el) => path.resolve(dir, el)))
  const contentsOfElements = await Promise.all(elements.map(getContents(rel, only)))

  contentsOfElements.forEach((el) =>
    Array.isArray(el)
      ? el.forEach((file) => allFiles.push(file) !== 0)
      : filter(el, rel, only, (validPath) =>
          allFiles.push(validPath) !== 0,
        ),
  )

  return allFiles
}

const filter = (filePath: string, rel: string, only: RegExp, callback: filterCallback) => {
  const relative = path.relative(rel, filePath)
  const matches = only.exec(relative)

  if (!matches) return false

  return callback(matches[1] ? matches[1] : relative)
}

const getContents = (rel: string, only: RegExp) => async (element: string) => {
  const isDirectory = (await stat(element)).isDirectory()

  if (isDirectory) return readDir(element, rel, only)

  return element
}

export default getFilesFrom
