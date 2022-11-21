import os from 'os'
import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import childProcess from 'child_process'
import { randomBytes } from 'crypto'
import { FileRef } from 'e2e-utils'
import type { InstallCommand, PackageJson } from './next-modes/base'

const { linkPackages } =
  require('../../.github/actions/next-stats-action/src/prepare/repo-setup')()

type Files = FileRef | { [filename: string]: string | FileRef }

export type FilterFn =
  | ((src: string, dest: string, content?: string) => Promise<boolean>)
  | ((src: string, dest: string, content?: string) => boolean)

const readFileOrNull = (filePath: string): Promise<string | null> =>
  fs
    .readFile(filePath, 'utf8')
    .catch((err) => (err.code === 'ENOENT' ? null : Promise.reject(err)))

export const getFileContent = async (
  files: Files,
  filename: string
): Promise<string | undefined> => {
  if (files instanceof FileRef) {
    return readFileOrNull(path.join(files.fsPath, filename))
  } else {
    for (const file of Object.keys(files)) {
      if (file === filename) {
        const item = files[file]
        return typeof item === 'string' ? item : readFileOrNull(item.fsPath)
      }
    }
  }
  return null
}

export async function writeInitialFiles(
  files: Files,
  testDir: string,
  filter?: FilterFn
) {
  if (files instanceof FileRef) {
    // if a FileRef is passed directly to `files` we copy the
    // entire folder to the test directory
    const stats = await fs.stat(files.fsPath)

    if (!stats.isDirectory()) {
      throw new Error(
        `FileRef passed to "files" in "createNext" is not a directory ${files.fsPath}`
      )
    }
    await fs.copy(files.fsPath, testDir, { filter })
  } else {
    for (const filename of Object.keys(files)) {
      const item = files[filename]
      const outputFilename = path.join(testDir, filename)

      if (
        !filter ||
        (await filter(
          filename,
          outputFilename,
          typeof item === 'string' ? item : undefined
        ))
      ) {
        if (typeof item === 'string') {
          await fs.ensureDir(path.dirname(outputFilename))
          await fs.writeFile(outputFilename, item)
        } else {
          await fs.copy(item.fsPath, outputFilename, { filter })
        }
      }
    }
  }
}

export async function initTemporalDirs(dirSuffix = '') {
  const tmpDir = await fs.realpath(process.env.NEXT_TEST_DIR || os.tmpdir())
  const origRepoDir = path.join(__dirname, '../../')
  const installDir = path.join(
    tmpDir,
    `next-install-${randomBytes(32).toString('hex')}${dirSuffix}`
  )
  const tmpRepoDir = path.join(
    tmpDir,
    `next-repo-${randomBytes(32).toString('hex')}${dirSuffix}`
  )

  // ensure swc binary is present in the native folder if
  // not already built
  for (const folder of await fs.readdir(
    path.join(origRepoDir, 'node_modules/@next')
  )) {
    if (folder.startsWith('swc-')) {
      const swcPkgPath = path.join(origRepoDir, 'node_modules/@next', folder)
      const outputPath = path.join(origRepoDir, 'packages/next-swc/native')
      await fs.copy(swcPkgPath, outputPath, {
        filter: (item) => {
          return (
            item === swcPkgPath ||
            (item.endsWith('.node') &&
              !fs.pathExistsSync(path.join(outputPath, path.basename(item))))
          )
        },
      })
    }
  }

  for (const item of ['package.json', 'packages']) {
    await fs.copy(path.join(origRepoDir, item), path.join(tmpRepoDir, item), {
      filter: (item) => {
        return (
          !item.includes('node_modules') &&
          !item.includes('.DS_Store') &&
          // Exclude Rust compilation files
          !/next[\\/]build[\\/]swc[\\/]target/.test(item) &&
          !/next-swc[\\/]target/.test(item)
        )
      },
    })
  }

  return { installDir, tmpRepoDir }
}

export async function createTestDir({
  packageJson,
  dependencies,
  installCommand,
  dirSuffix = '',
  packageLockPath = '',
  apps,
  packages,
}: {
  packageJson: PackageJson
  dependencies: PackageJson['dependencies']
  installCommand?: InstallCommand
  dirSuffix?: string
  packageLockPath?: string
  apps?: string[]
  packages?: string[]
}): Promise<string> {
  const { installDir, tmpRepoDir } = await initTemporalDirs(dirSuffix)
  const packageJsons: [string, PackageJson][] = [['package.json', packageJson]]

  let combinedDependencies = dependencies

  const skipLocalDeps = (pkgJson: PackageJson) =>
    !!(pkgJson && pkgJson.nextPrivateSkipLocalDeps)

  // if (apps?.length || packages?.length) {
  //   if (packageJson?.devDependencies.turbo) {
  //     throw new Error(
  //       `"turbo" needs to be a dev dependency of the root package.json when testing monorepos`
  //     )
  //   }

  //   await writeInitialFiles()
  // }

  if (packageJsons.some(([, packageJson]) => !skipLocalDeps(packageJson))) {
    const pkgPaths = await linkPackages(tmpRepoDir)

    combinedDependencies = {
      next: pkgPaths.get('next'),
      ...Object.keys(dependencies).reduce((prev, pkg) => {
        const pkgPath = pkgPaths.get(pkg)
        prev[pkg] = pkgPath || dependencies[pkg]
        return prev
      }, {}),
    }
  }

  for (const [dest, packageJson] of packageJsons) {
    await fs.ensureDir(path.join(installDir, path.dirname(dest)))
    await fs.writeFile(
      path.join(installDir, dest),
      JSON.stringify(
        packageJson?.devDependencies?.turbo
          ? // Don't modify the dependencies in the monorepo's package.json,
            // since it won't include next or react
            packageJson
          : {
              ...packageJson,
              dependencies: {
                ...packageJson?.dependencies,
                ...(skipLocalDeps(packageJson)
                  ? dependencies
                  : combinedDependencies),
              },
              private: true,
            },
        null,
        2
      )
    )
  }

  if (packageLockPath) {
    await fs.copy(
      packageLockPath,
      path.join(installDir, path.basename(packageLockPath))
    )
  }
  if (pnpmWorkspace) {
    await fs.writeFile(
      path.join(installDir, 'pnpm-workspace.yaml'),
      pnpmWorkspace
    )
  }

  if (installCommand) {
    const installString =
      typeof installCommand === 'function'
        ? installCommand({ dependencies: combinedDependencies })
        : installCommand

    console.log('running install command', installString)

    childProcess.execSync(installString, {
      cwd: installDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  } else {
    await execa('pnpm', ['install', '--strict-peer-dependencies=false'], {
      cwd: installDir,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    })
  }

  await fs.remove(tmpRepoDir)
  return installDir
}
