const fs = require('fs')
const { join, dirname } = require('path')
const { packageList, entrypointMapping } = require('./package-list')
const {
  // divideArrayInChunks,
  normalizePackageName,
} = require('./generate-helpers')

function writeFile(filePath, contents) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

const testTemplate = fs.readFileSync(
  join(__dirname, 'ecosystem-packages-test-template.js'),
  'utf8'
)

function createTestCode(packageName, normalizedPackageName) {
  return testTemplate
    .replaceAll('NORMALIZED_PACKAGE_NAME', normalizedPackageName) // Order important because `PACKAGE_NAME` is a substring of `NORMALIZED_PACKAGE_NAME`
    .replaceAll('PACKAGE_NAME', packageName)
}

function writeIndividualFiles(packageList) {
  for (const packageName of packageList) {
    const normalizedPackageName = normalizePackageName(packageName)

    const packageTestDir = join(__dirname, normalizedPackageName)
    fs.rmSync(packageTestDir, { force: true, recursive: true })

    writeFile(
      join(packageTestDir, `${normalizedPackageName}.test.js`),
      createTestCode(packageName, normalizedPackageName)
    )

    const appPath = join(packageTestDir, 'app')
    writeFile(
      join(appPath, 'layout.js'),
      `export default function Root({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
    `
    )

    writeFile(
      join(appPath, 'server-components', normalizedPackageName, 'page.js'),
      `
import * as ${normalizedPackageName} from '${
        entrypointMapping[packageName] || packageName
      }'
console.log(${normalizedPackageName})

export default function Page() {
    return <h1>Hello World</h1>
}

`
    )

    writeFile(
      join(appPath, 'client-components', normalizedPackageName, 'page.js'),
      `"use client"
import * as ${normalizedPackageName} from '${
        entrypointMapping[packageName] || packageName
      }'
console.log(${normalizedPackageName})

export default function Page() {
    return <h1>Hello World</h1>
}

`
    )
  }
}

// function writeToBarrelFiles(packageList, type) {
//   fs.rmSync(join(__dirname, 'app', 'list'), { recursive: true })
//   const arr = divideArrayInChunks(packageList, packageList.length / 4)
//   for (let i = 0; i < arr.length; i++) {
//     const imports = []
//     const vars = []

//     const chunk = arr[i]
//     for (const packageName of chunk) {
//       const normalizedPackageName = normalizePackageName(packageName)

//       imports.push(`import * as ${normalizedPackageName} from '${packageName}'`)
//       vars.push(`console.log(${normalizedPackageName})`)
//     }

//     writeFile(
//       join(__dirname, 'app', 'list', i.toString(), 'page.js'),
//       `
//       ${type === 'client' ? '"use client";' : ''}
//     ${imports.join('\n')}
//     ${vars.join('\n')}

// export default function Page() {
//   return <h1>Hello World</h1>
// }
//   `
//     )
//   }
// }

function writePackageJson(packageList) {
  writeFile(
    join(__dirname, 'package.json'),
    JSON.stringify(
      {
        name: 'ecosystem-packages',
        private: true,
        dependencies: packageList.reduce((acc, packageName) => {
          acc[packageName] = '*'
          return acc
        }, {}),
      },
      null,
      '  '
    )
  )
}

writeIndividualFiles(packageList)
writePackageJson(packageList)
