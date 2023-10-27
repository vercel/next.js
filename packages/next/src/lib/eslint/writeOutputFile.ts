import { promises as fs } from 'fs'
import path from 'path'
import * as Log from '../../build/output/log'
import isError from '../../lib/is-error'

/**
 * Check if a given file path is a directory or not.
 * Returns `true` if the path is a directory.
 */
function isDirectory(
  /**  The path to a file to check. */
  filePath: string
): Promise<boolean> {
  return fs
    .stat(filePath)
    .then((stat) => stat.isDirectory())
    .catch((error) => {
      if (
        isError(error) &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return false
      }
      throw error
    })
}
/**
 * Create a file with eslint output data
 */
export async function writeOutputFile(
  /** The name file that needs to be created */
  outputFile: string,
  /** The data that needs to be inserted into the file */
  outputData: string
): Promise<void> {
  const filePath = path.resolve(process.cwd(), outputFile)

  if (await isDirectory(filePath)) {
    Log.error(
      `Cannot write to output file path, it is a directory: ${filePath}`
    )
  } else {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, outputData)
      Log.info(`The output file has been created: ${filePath}`)
    } catch (err) {
      Log.error(`There was a problem writing the output file: ${filePath}`)
      console.error(err)
    }
  }
}
