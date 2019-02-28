import { recursiveReadDir, pathCallback } from './recursive-readdir'
import { relative } from 'path'
import { promisify } from 'util'
import fs from 'fs'

const rmdir = promisify(fs.rmdir)
const unlink = promisify(fs.unlink)

function fileFilter(pattern: RegExp): pathCallback {
  return async (name) => !pattern.test(name)
}

/**
 * Recursively filter files
 * @param  {string} dir Directory to read
 * @param  {{filterFiles: RegExp}} options Filter for the file name, only the name part is considered, not the full path
 * @param  {string[]=[]} arr This doesn't have to be provided, it's used for the recursion
 * @param  {string=dir`} rootDir Used to replace the initial path, only the relative path is left, it's faster than path.relative.
 * @returns Promise array holding all relative paths
 */
export function recursiveFilter(dir: string, options: { files?: RegExp }, arr: string[] = [], rootDir: string = dir): Promise<string[]> {
  return recursiveReadDir(dir, arr, rootDir, options.files ? fileFilter(options.files) : undefined)
}

function ensureScope(dir: string): pathCallback {
  return async (_, absolute) => relative(dir, absolute).substring(0, 1) !== '..'
}

const deleteFile: pathCallback = async (_, absolute) => await unlink(absolute).then(() => false)
const deleteDir: pathCallback = async (_, absolute) => await rmdir(absolute).then(() => false)

/**
 * Recursively delete files
 * @param  {string} dir Directory to read
 * @param  {{force: boolean}} options Filter for the file name, only the name part is considered, not the full path
 * @param  {string[]=[]} arr This doesn't have to be provided, it's used for the recursion
 * @param  {string=dir`} rootDir Used to replace the initial path, only the relative path is left, it's faster than path.relative.
 * @returns Promise array holding all relative paths
 */
export function recursiveDelete(dir: string, options?: {}, arr: string[] = [], rootDir: string = dir): Promise<string[]> {
  return recursiveReadDir(dir, arr, rootDir, deleteFile, ensureScope(dir), deleteDir)
}
