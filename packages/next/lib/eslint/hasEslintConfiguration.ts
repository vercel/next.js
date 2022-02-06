import { promises as fs } from 'fs'

export type ConfigAvailable = {
  exists: boolean
  emptyEslintrc?: boolean
  emptyPkgJsonConfig?: boolean
  firstTimeSetup?: true
}

export async function hasEslintConfiguration(
  eslintrcFile: string | null,
  packageJsonConfig: { eslintConfig: any } | null
): Promise<ConfigAvailable> {
  const configObject = {
    exists: false,
    emptyEslintrc: false,
    emptyPkgJsonConfig: false,
  }

  if (eslintrcFile) {
    const content = await fs.readFile(eslintrcFile, { encoding: 'utf8' }).then(
      (txt) => txt.trim().replace(/\n/g, ''),
      () => null
    )

    if (
      content === '' ||
      content === '{}' ||
      content === '---' ||
      content === 'module.exports = {}'
    ) {
      return { ...configObject, emptyEslintrc: true }
    }
  } else if (packageJsonConfig?.eslintConfig) {
    if (Object.entries(packageJsonConfig?.eslintConfig).length === 0) {
      return {
        ...configObject,
        emptyPkgJsonConfig: true,
      }
    }
  } else {
    return configObject
  }

  return { ...configObject, exists: true }
}
