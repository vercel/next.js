const path = require('path')
const fs = require('fs')
const { existsSync } = require('fs')
const exec = require('../util/exec')
const logger = require('../util/logger')

module.exports = (actionInfo) => {
  return {
    async cloneRepo(repoPath = '', dest = '', branch = '', depth = '20') {
      await fs.promises.rm(dest, { recursive: true, force: true })
      await exec.spawnPromise('git', {
        args: [
          'clone',
          `${actionInfo.gitRoot}${repoPath}`,
          '--single-branch',
          '--branch',
          branch,
          `--depth=${depth}`,
          dest,
        ],
        stdio: 'pipe',
      })
    },
    async getLastStable() {
      const res = await fetch(
        `https://api.github.com/repos/vercel/next.js/releases/latest`,
        {
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      )

      if (!res.ok) {
        throw new Error(
          `Failed to get latest stable tag ${res.status}: ${await res.text()}`
        )
      }
      const data = await res.json()
      return data.tag_name
    },
    async getCommitId(repoDir = '') {
      const child = exec.spawn('git', {
        args: ['rev-parse', 'HEAD'],
        cwd: repoDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      await new Promise((resolve, reject) => {
        child.on('error', reject)
        child.on('exit', (code, signal) => {
          if (code || signal) {
            return reject(
              new Error(`bad exit code/signal code: ${code} signal: ${signal}`)
            )
          }
          resolve()
        })
      })

      return stdout.trim()
    },
    async resetToRef(ref = '', repoDir = '') {
      await exec.spawnPromise('git', {
        args: ['reset', '--hard', ref],
        cwd: repoDir,
        stdio: 'pipe',
      })
    },
    async mergeBranch(ref = '', origRepoDir = '', destRepoDir = '') {
      await exec.spawnPromise('git', {
        args: ['remote', 'add', 'upstream', origRepoDir],
        cwd: destRepoDir,
        stdio: 'pipe',
      })
      await exec.spawnPromise('git', {
        args: ['fetch', 'upstream'],
        cwd: destRepoDir,
        stdio: 'pipe',
      })

      try {
        await exec.spawnPromise('git', {
          args: ['merge', `upstream/${ref}`],
          cwd: destRepoDir,
          stdio: 'pipe',
        })
        logger('Auto merge of main branch successful')
      } catch (err) {
        logger.error('Failed to auto merge main branch:', err)

        if (err.stdout && err.stdout.includes('CONFLICT')) {
          await exec.spawnPromise('git', {
            args: ['merge', '--abort'],
            cwd: destRepoDir,
            stdio: 'pipe',
          })
          logger('aborted auto merge')
        }
      }
    },
    /**
     * Scans pre-built `packed.tgz` tarballs produced by `turbo run pack`
     * in each package under `repoDir/packages/`.
     * @param {{ repoDir: string }} options
     * @returns {Promise<Map<string, string>>} Map of package name to tarball path
     */
    async linkPackages({ repoDir }) {
      /** @type {Map<string, string>} */
      const pkgPaths = new Map()

      let packageFolders
      try {
        packageFolders = await fs.promises.readdir(
          path.join(repoDir, 'packages')
        )
      } catch (err) {
        if (err.code === 'ENOENT') {
          require('console').log('no packages to link')
          return pkgPaths
        }
        throw err
      }

      for (const packageFolder of packageFolders) {
        const packagePath = path.join(repoDir, 'packages', packageFolder)
        const tarballPath = path.join(packagePath, 'packed.tgz')
        const packageJsonPath = path.join(packagePath, 'package.json')

        if (!existsSync(packageJsonPath) || !existsSync(tarballPath)) {
          continue
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        pkgPaths.set(packageJson.name, tarballPath)
      }

      require('console').log(
        `Found ${pkgPaths.size} packed tarballs:`,
        Array.from(pkgPaths.keys()).join(', ')
      )

      return pkgPaths
    },
  }
}
