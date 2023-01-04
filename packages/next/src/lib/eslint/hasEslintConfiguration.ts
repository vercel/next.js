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
    return { ...configObject, exists: true }
  } else if (packageJsonConfig?.eslintConfig) {
    if (Object.keys(packageJsonConfig?.eslintConfig).length) {
      return { ...configObject, exists: true }
    }
    return { ...configObject, emptyPkgJsonConfig: true }
  }
  return configObject
}
