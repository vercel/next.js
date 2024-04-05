const fs = require('fs')
const { join, dirname } = require('path')
const { packageList } = require('./package-list')
const {
  // divideArrayInChunks,
  normalizePackageName,
} = require('./generate-helpers')

function writeFile(filePath, contents) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

function writeIndividualFiles(packageList) {
  for (const packageName of packageList) {
    const normalizedPackageName = normalizePackageName(packageName)

    const packageTestDir = join(__dirname, normalizedPackageName)
    fs.rmSync(packageTestDir, { force: true, recursive: true })

    writeFile(
      join(packageTestDir, `${normalizedPackageName}.test.js`),
      `
    import { ecosystemPackageTest } from '../ecosystem-package-test'
    ecosystemPackageTest('${packageName}')
    `
    )
  }
}

writeIndividualFiles(packageList)
