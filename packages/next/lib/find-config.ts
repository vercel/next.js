import findUp from 'find-up'
import fs from 'fs'
import JSON5 from 'json5'
import path from 'path'

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>
}

// We'll allow configuration to be typed, but we force everything provided to
// become optional. We do not perform any schema validation. We should maybe
// force all the types to be `unknown` as well.
export async function findConfig<T>(
  directory: string,
  key: string
): Promise<RecursivePartial<T> | null> {
  // `package.json` configuration always wins. Let's check that first.
  const packageJsonPath = await findUp('package.json', { cwd: directory })
  if (packageJsonPath) {
    const packageJson = require(packageJsonPath)
    if (packageJson[key] != null && typeof packageJson[key] === 'object') {
      return packageJson[key]
    }
  }

  // If we didn't find the configuration in `package.json`, we should look for
  // known filenames. The /rc$/ version of this file does not support YAML
  // like some configuration loaders.
  const filePath = await findUp(
    [`.${key}rc`, `.${key}rc.json`, `${key}.config.json`].filter(
      Boolean
    ) as string[],
    { cwd: directory }
  )
  if (filePath) {
    if (filePath.endsWith('.js')) {
      // The JavaScript variant of this file must export an object. We don't
      // allow a function or similar. The configuration loader is meant to be
      // "dumb".
      const config = require(filePath)
      if (config == null || typeof config !== 'object') {
        const fileName = path.basename(filePath)
        throw new Error(
          `The configuration file \`${fileName}\` must export an object.`
        )
      }
      return config
    }

    // We load JSON contents with JSON5 to allow users to comment in their
    // configuration file. This pattern was popularized by TypeScript.
    const fileContents = fs.readFileSync(filePath, 'utf8')
    return JSON5.parse(fileContents)
  }

  return null
}
