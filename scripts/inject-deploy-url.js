const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs/promises')

const cwd = process.cwd()

async function main() {
  const tarballs = await fs.readdir(path.join(cwd, 'public'))
  const nextTarball = tarballs.find((item) => !item.includes('-swc'))

  await fs.rename(
    path.join(cwd, 'public', nextTarball),
    path.join(cwd, nextTarball)
  )

  await new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', nextTarball], {
      stdio: 'inherit',
      shell: true,
      cwd,
    })

    child.on('exit', (code) => {
      if (code) {
        return reject(`Failed with code ${code}`)
      }
      resolve()
    })
  })

  const unpackedPackageJson = path.join(cwd, 'package/package.json')
  const parsedPackageJson = JSON.parse(
    await fs.readFile(unpackedPackageJson, 'utf8')
  )
  const { optionalDependencies } = parsedPackageJson

  for (const key of Object.keys(optionalDependencies)) {
    optionalDependencies[key] = optionalDependencies[key].replace(
      'DEPLOY_URL',
      process.env.VERCEL_URL
    )
  }

  await fs.writeFile(
    unpackedPackageJson,
    JSON.stringify(parsedPackageJson, null, 2)
  )

  await fs.unlink(nextTarball)

  await new Promise((resolve, reject) => {
    const child = spawn('tar', ['-czf', nextTarball, 'package'], {
      stdio: 'inherit',
      shell: true,
      cwd,
    })

    child.on('exit', (code) => {
      if (code) {
        return reject(`Failed with code ${code}`)
      }
      resolve()
    })
  })

  await fs.rename(
    path.join(cwd, nextTarball),
    path.join(cwd, 'public', nextTarball)
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
