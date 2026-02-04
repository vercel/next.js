import findUp from 'next/dist/compiled/find-up'
import { readFile } from 'fs/promises'
import JSON5 from 'next/dist/compiled/json5'
import { pathToFileURL } from 'url'

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>
}

export function findConfigPath(
  dir: string,
  key: string
): Promise<string | undefined> {
  // If we didn't find the configuration in `package.json`, we should look for
  // known filenames.
  return findUp(
    [
      `.${key}rc.json`,
      `${key}.config.json`,
      `.${key}rc.js`,
      `${key}.config.js`,
      `${key}.config.mjs`,
      `${key}.config.cjs`,
    ],
    {
      cwd: dir,
    }
  )
}

// We'll allow configuration to be typed, but we force everything provided to
// become optional. We do not perform any schema validation. We should maybe
// force all the types to be `unknown` as well.
export async function findConfig<T>(
  directory: string,
  key: string,
  _returnFile?: boolean
): Promise<RecursivePartial<T> | null> {
  // `package.json` configuration always wins. Let's check that first.
  const packageJsonPath = await findUp('package.json', { cwd: directory })
  let isESM = false

  if (packageJsonPath) {
    try {
      const packageJsonStr = await readFile(packageJsonPath, 'utf8')
      const packageJson = JSON.parse(packageJsonStr) as {
        [key: string]: string
      }

      if (typeof packageJson !== 'object') {
        throw new Error() // Stop processing and continue
      }

      if (packageJson.type === 'module') {
        isESM = true
      }

      if (packageJson[key] != null && typeof packageJson[key] === 'object') {
        return packageJson[key]
      }
    } catch {
      // Ignore error and continue
    }
  }

  const filePath = await findConfigPath(directory, key)

  const esmImport = (path: string) => {
    // Skip mapping to absolute url with pathToFileURL on windows if it's jest
    // https://github.com/nodejs/node/issues/31710#issuecomment-587345749
    if (process.platform === 'win32' && !process.env.JEST_WORKER_ID) {
      // on windows import("C:\\path\\to\\file") is not valid, so we need to
      // use file:// URLs
      return import(pathToFileURL(path).toString())
    } else {
      return import(path)
    }
  }

  if (filePath) {
    if (filePath.endsWith('.js')) {
      if (isESM) {
        return (await esmImport(filePath)).default
      } else {
        return require(filePath)
      }
    } else if (filePath.endsWith('.mjs')) {
      return (await esmImport(filePath)).default
    } else if (filePath.endsWith('.cjs')) {
      return require(filePath)
    }

    // We load JSON contents with JSON5 to allow users to comment in their
    // configuration file. This pattern was popularized by TypeScript.
    const fileContents = await readFile(filePath, 'utf8')
    return JSON5.parse(fileContents)
  }

  return null
}
