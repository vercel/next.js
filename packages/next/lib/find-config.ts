import findUp from 'next/dist/compiled/find-up'
import { importDefaultInterop } from './import-interop'

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
    const packageJson = await importDefaultInterop(packageJsonPath)
    if (packageJson[key] != null && typeof packageJson[key] === 'object') {
      return packageJson[key]
    }
  }

  // If we didn't find the configuration in `package.json`, we should look for
  // known filenames.
  const filePath = await findUp(
    [
      `.${key}rc.json`,
      `${key}.config.json`,
      `.${key}rc.js`,
      `${key}.config.js`,
    ],
    {
      cwd: directory,
    }
  )

  if (filePath) {
    return importDefaultInterop(filePath)
  }

  return null
}
