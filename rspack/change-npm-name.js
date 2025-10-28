const fs = require('fs')
const path = require('path')

const newPackageName = process.argv[2]

if (!newPackageName) {
  console.error('Usage: node change-npm-name.js <new-package-name>')
  console.error('Example: node change-npm-name.js @next/rspack-core')
  process.exit(1)
}

const bindingPackageName = newPackageName.replace(/core/g, 'binding')

console.log(`Core package name: ${newPackageName}`)
console.log(`Binding package name: ${bindingPackageName}`)
console.log(`GitHub Repository: ${process.env.GITHUB_REPOSITORY || 'not set'}`)

function updatePackageJson(filePath, packageName) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Package.json not found: ${filePath}`)
      return
    }

    const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    packageJson.name = packageName

    // Update repository URL to match current GitHub repo for provenance validation
    if (packageJson.repository && packageJson.repository.url) {
      const githubRepo = process.env.GITHUB_REPOSITORY
      if (githubRepo) {
        packageJson.repository.url = `git+https://github.com/${githubRepo}.git`
        console.log(
          `📝 Updated repository URL to: ${packageJson.repository.url}`
        )
      } else {
        console.log(
          `⚠️  GITHUB_REPOSITORY not found, keeping original repository URL: ${packageJson.repository.url}`
        )
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n')
    console.log(`✅ Updated ${filePath} with name: ${packageName}`)
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message)
  }
}

function updateBindingIndex(filePath, packageName) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Binding index.js not found: ${filePath}`)
      return
    }

    let content = fs.readFileSync(filePath, 'utf8')

    // Replace all require('@next/rspack-binding-*') with the new package name pattern
    const requireRegex =
      /require\(['"`]@next\/rspack-binding(-[^'"`]*)?['"`]\)/g
    let updateCount = 0

    content = content.replace(requireRegex, (match, suffix) => {
      updateCount++
      return `require('${packageName}${suffix || ''}')`
    })

    if (updateCount > 0) {
      fs.writeFileSync(filePath, content)
      console.log(
        `✅ Updated ${filePath} with ${updateCount} require statements using package name: ${packageName}`
      )
    } else {
      console.warn(
        `⚠️  No require statements with @next/rspack-binding found in ${filePath}`
      )
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message)
  }
}

function main() {
  const rootDir = __dirname

  const rootPackageJsonPath = path.join(rootDir, 'package.json')
  updatePackageJson(rootPackageJsonPath, newPackageName)

  const bindingPackageJsonPath = path.join(
    rootDir,
    'crates/binding/package.json'
  )
  updatePackageJson(bindingPackageJsonPath, bindingPackageName)

  const bindingIndexPath = path.join(rootDir, 'crates/binding/index.js')
  updateBindingIndex(bindingIndexPath, bindingPackageName)

  console.log('\n🎉 Package name update completed!')
}

main()
