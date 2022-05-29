import { promises as fs } from 'fs'
import { extname } from 'path'
import JSON5 from 'next/dist/compiled/json5'

/**
 * CJS-ESM interoperable module import.
 *
 * @param specifier The specifier of the module to load.
 * @returns The loaded module.
 */
export const importInterop = async (specifier: string) => {
  /**
   * If this is a JSON file, load it and imitate require("file.json") behavior.
   */
  if (extname(specifier) === '.json') {
    const json = await fs.readFile(specifier, 'utf-8')
    /**
     * We load JSON contents with JSON5 to allow users to comment in their
     * configuration file. This pattern was popularized by TypeScript.
     */
    return JSON5.parse(json)
  } else {
    try {
      const importedModule = await import(specifier)
      return importedModule
    } catch (e) {
      const importedModule = require(specifier)
      return importedModule.default || importedModule
    }
  }
}

/**
 * CJS-ESM interoperable default module import.
 *
 * @param specifier The specifier of the module to load.
 * @returns The interop equivalent of the default export.
 */
export const importDefaultInterop = async (specifier: string) => {
  const importedModule = await importInterop(specifier)
  return importedModule.default || importedModule
}
