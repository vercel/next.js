import execa from 'execa'
import fs from 'fs/promises'
import path from 'path'

export async function generatePackageJson(folder, withLocalNext = false) {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(folder, 'package.json'))
  )

  const currentVersions = await getCurrentRootReactPackagesVersions()

  packageJson.dependencies = packageJson.dependencies || {}
  packageJson.dependencies['react'] = currentVersions.react
  packageJson.dependencies['react-dom'] = currentVersions['react-dom']
  if (withLocalNext) {
    packageJson.dependencies.next = await packNextBuild(folder)
  } else {
    packageJson.dependencies.next = await getCurrentNextVersion()
  }

  await fs.writeFile(
    path.join(folder, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  )
}

export async function packNextBuild(folder) {
  const process = await execa('npm', [
    'pack',
    '../../packages/next',
    `--pack-destination=${folder}`,
  ])

  return `file:./${process.stdout}`
}

async function getCurrentNextVersion() {
  const packageJson = JSON.parse(
    await fs.readFile('../../packages/next/package.json', 'utf8')
  )
  return packageJson.version
}

async function getCurrentRootReactPackagesVersions() {
  const packageJson = JSON.parse(
    await fs.readFile('../../package.json', 'utf8')
  )
  return {
    react: packageJson.devDependencies['react'],
    'react-dom': packageJson.devDependencies['react-dom'],
  }
}
