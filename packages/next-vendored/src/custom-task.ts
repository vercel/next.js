import fs from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Task as CoreTask, type TFile } from './task.js'
import ncc, { type NccOptions } from '@vercel/ncc'

type NccTaskOptions = {
  packageName: string
  packageJsonName?: string
} & NccOptions

export class Task extends CoreTask {
  new() {
    return new Task(this.options)
  }

  async clear(path: string) {
    await fs.rm(path, { recursive: true, force: true })
  }

  ncc(options: NccTaskOptions) {
    const { packageName } = options

    if (options.externals && packageName) {
      options.externals = { ...options.externals }
      delete options.externals[packageName]
    }

    this.use(async (files) => {
      const file = files[0]!
      const output = await ncc(file.path, {
        filename: basename(file.path),
        minify: options.minify !== false,
        assetBuilds: true,
        cache: false,
        ...options,
      })

      for (const [name, asset] of Object.entries(output.assets)) {
        // We'll add a package.json later
        if (name === 'package.json') continue

        files.push({
          path: join(dirname(file.path), name),
          data: Buffer.from(asset.source, 'utf8'),
        })
      }

      if (packageName) {
        await addMissingFiles(
          file.path,
          packageName,
          files,
          options.packageJsonName
        )
      }

      file.data = Buffer.from(output.code, 'utf8')
    })
    return this
  }
}

async function addMissingFiles(
  indexPath: string,
  packageName: string,
  files: TFile[],
  packageJsonName?: string
) {
  const dirPath = dirname(indexPath)
  const packageJsonPath = await findInPackage(dirPath, 'package.json')

  if (!packageJsonPath) {
    throw new Error(`Couldn't find a package.json for ${packageName}`)
  }

  let packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
  const combinedPackageJson = { ...packageJson }
  const rootPackageJsonPath = await findInPackage(
    dirname(dirPath),
    'package.json'
  )
  // ESM libraries can have a nested `package.json` so we'll check for a root one
  if (rootPackageJsonPath) {
    const rootPackageJson = JSON.parse(
      await fs.readFile(rootPackageJsonPath, 'utf8')
    )
    Object.assign(combinedPackageJson, rootPackageJson)
  }

  const { name, author, license } = combinedPackageJson

  files.push({
    path: packageJsonPath,
    data: Buffer.from(
      JSON.stringify(
        Object.assign(
          {},
          // Include the nested package.json if any
          rootPackageJsonPath && packageJson,
          {
            name: packageJsonName ?? name,
            main: basename(indexPath),
          },
          author && { author },
          license && { license }
        )
      ),
      'utf8'
    ),
  })

  const licensePath =
    (await findInPackage(dirPath, 'LICENSE')) ||
    (await findInPackage(dirPath, 'license'))

  if (licensePath) {
    files.push({
      path: join(dirPath, 'LICENSE'),
      data: await fs.readFile(licensePath),
    })
  }
}

async function findInPackage(path: string, target: string) {
  if (!path.includes('/node_modules/')) {
    throw new Error(`The path "${path}" is not under node_modules`)
  }

  while (true) {
    if (path.endsWith('node_modules')) break

    const filePath = join(path, target)

    try {
      await fs.access(filePath, fs.constants.R_OK)
      return filePath
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }

    path = dirname(path)
  }
}
