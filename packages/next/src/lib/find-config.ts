import findUp from 'next/dist/compiled/find-up'
import { readFile } from 'fs/promises'
import JSON5 from 'next/dist/compiled/json5'
import { pathToFileURL } from 'url'
import { createJiti, type Jiti } from 'jiti'

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>
}

export function findConfigPath(
  dir: string,
  key: string
): Promise<string | undefined> {
  // If we didn't find the configuration in `package.json`, we should look for
  // known filenames.
  // https://github.com/postcss/postcss-load-config#postcssrcjs-or-postcssconfigjs
  return findUp(
    [
      `.${key}rc.json`,
      `${key}.config.json`,
      `.${key}rc.js`,
      `.${key}rc.ts`,
      `.${key}rc.mjs`,
      `.${key}rc.mts`,
      `.${key}rc.cjs`,
      `.${key}rc.cts`,
      `${key}.config.js`,
      `${key}.config.ts`,
      `${key}.config.mjs`,
      `${key}.config.mts`,
      `${key}.config.cjs`,
      `${key}.config.cts`,
    ],
    {
      cwd: dir,
    }
  )
}

function filePathIsAmbiguousJs(filePath: string): boolean {
  return filePath.endsWith('.js') || filePath.endsWith('.ts')
}

function filePathIsModule(filePath: string): boolean {
  return filePath.endsWith('.mjs') || filePath.endsWith('.mts')
}

function filePathIsCommonJs(filePath: string): boolean {
  return filePath.endsWith('.cts') || filePath.endsWith('.cjs')
}

function filePathIsTypescript(filePath: string): boolean {
  return (
    filePath.endsWith('.ts') ||
    filePath.endsWith('.mts') ||
    filePath.endsWith('.cts')
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

  const cjsRequire = (path: string) => {
    if (filePathIsTypescript(path)) {
      const jiti = getJiti()
      return jiti(path)
    }
    return require(path)
  }

  const esmImport = (path: string) => {
    // Skip mapping to absolute url with pathToFileURL on windows if it's jest
    // https://github.com/nodejs/node/issues/31710#issuecomment-587345749
    if (process.platform === 'win32' && !process.env.JEST_WORKER_ID) {
      // on windows import("C:\\path\\to\\file") is not valid, so we need to
      // use file:// URLs
      path = pathToFileURL(path).toString()
    }

    if (filePathIsTypescript(path)) {
      const jiti = getJiti()
      return jiti.import(path)
    }

    return import(path)
  }

  if (filePath) {
    if (isESM && filePathIsAmbiguousJs(filePath)) {
      return (await esmImport(filePath)).default
    }
    if (!isESM && filePathIsAmbiguousJs(filePath)) {
      return cjsRequire(filePath)
    }
    if (filePathIsModule(filePath)) {
      return (await esmImport(filePath)).default
    }
    if (filePathIsCommonJs(filePath)) {
      return cjsRequire(filePath)
    }

    // We load JSON contents with JSON5 to allow users to comment in their
    // configuration file. This pattern was popularized by TypeScript.
    const fileContents = await readFile(filePath, 'utf8')
    return JSON5.parse(fileContents)
  }

  return null
}

// jiti is installed anyway, for tailwind - with pnpm, there is no reason for
// next.js not to use it too
// https://github.com/tailwindlabs/tailwindcss/blob/8c6c291869c72ba9aaa274d9ad14a83129b1f8d7/packages/%40tailwindcss-node/src/compile.ts#L50-L64
let jiti: Jiti | undefined
function getJiti() {
  return (jiti ??= createJiti(import.meta.url, {
    moduleCache: false,
    fsCache: false,
  }))
}
