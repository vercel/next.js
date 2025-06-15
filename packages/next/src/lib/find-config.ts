import { readFile } from 'fs/promises'
import JSON5 from 'next/dist/compiled/json5'
import { pathToFileURL } from 'url'
import { transformSync } from '@swc/core'
import path from 'path'

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

// Transpile TypeScript to JavaScript using SWC
async function transpileTypeScript(filePath: string, isESM: boolean): Promise<string> {
  const source = await readFile(filePath, 'utf8')
  const result = transformSync(source, {
    filename: filePath,
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: filePath.endsWith('x'),
      },
      target: 'es2020',
    },
    module: {
      type: isESM ? 'es6' : 'commonjs',
    },
    sourceMaps: false,
  })
  
  return result.code
}

// We'll allow configuration to be typed, but we force everything provided to
// become optional. We do not perform any schema validation.
export async function findConfig<T>(
  directory: string,
  key: string,
  isESM: boolean
): Promise<RecursivePartial<T> | null> {
  const filePath = await findConfigPath(directory, key)

  if (filePath) {
    // Handle TypeScript files
    if (filePathIsTypescript(filePath)) {
      const transpiledCode = await transpileTypeScript(filePath, 
        isESM || filePathIsModule(filePath)
      )
      
      // Create a temporary JS file path
      const tempFilePath = filePath.replace(/\.ts(x)?$/, '.js')
      
      // For ESM or .mts files
      if (isESM || filePathIsModule(filePath)) {
        // Create a module from the transpiled code
        const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiledCode).toString('base64')}`
        const module = await import(moduleUrl)
        return module.default
      } 
      // For CommonJS or .cts files
      else {
        // Use Node.js VM module to execute the code
        const vm = require('vm')
        const context = { 
          exports: {}, 
          require, 
          module: { exports: {} }, 
          __filename: tempFilePath,
          __dirname: path.dirname(tempFilePath)
        }
        
        vm.createContext(context)
        vm.runInContext(transpiledCode, context)
        
        return context.module.exports
      }
    }
    
    // Handle JavaScript files
    if (isESM && filePathIsAmbiguousJs(filePath)) {
      // For ESM
      const moduleUrl = process.platform === 'win32' && !process.env.JEST_WORKER_ID
        ? pathToFileURL(filePath).toString()
        : filePath
        
      return (await import(moduleUrl)).default
    } 
    
    if (!isESM && filePathIsAmbiguousJs(filePath)) {
      // For CommonJS
      return require(filePath)
    }
    
    if (filePathIsModule(filePath)) {
      // For .mjs/.mts files
      const moduleUrl = process.platform === 'win32' && !process.env.JEST_WORKER_ID
        ? pathToFileURL(filePath).toString()
        : filePath
        
      return (await import(moduleUrl)).default
    }
    
    if (filePathIsCommonJs(filePath)) {
      // For .cjs/.cts files
      return require(filePath)
    }

    // We load JSON contents with JSON5 to allow users to comment in their
    // configuration file.
    if (filePath.endsWith('.json')) {
      const fileContents = await readFile(filePath, 'utf8')
      return JSON5.parse(fileContents)
    }
  }

  return null
}
