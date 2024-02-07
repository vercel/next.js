const fs = require('fs')
const { join, dirname } = require('path')
const { packageList } = require('./package-list')

function normalizePackageName(packageName) {
  return packageName
    .replaceAll('/', '_')
    .replaceAll('@', '_')
    .replaceAll('-', '_')
    .replaceAll('.', '_')
}

function writeFile(filePath, contents) {
  fs.mkdirSync(dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

// function writeIndividualFiles(packageList) {
//   for (const packageName of packageList) {
//     const normalizedPackageName = normalizePackageName(packageName)

//     writeFile(
//       join(__dirname, 'app', 'packages', normalizedPackageName, 'page.js'),
//       outdent`
//     import * as ${normalizedPackageName} from '${packageName}'
//     console.log(${normalizedPackageName})

//     export default function Page() {
//         return <h1>Hello World</h1>
//     }
// `
//     )
//   }
// }

function divideArrayInChunks(array, chunkSize) {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

function writeToBarrelFiles(packageList, type) {
  const arr = divideArrayInChunks(packageList, packageList.length / 4)
  for (let i = 0; i < arr.length; i++) {
    const imports = []
    const vars = []

    const chunk = arr[i]
    for (const packageName of chunk) {
      const normalizedPackageName = normalizePackageName(packageName)

      imports.push(`import * as ${normalizedPackageName} from '${packageName}'`)
      vars.push(`console.log(${normalizedPackageName})`)
    }

    writeFile(
      join(__dirname, 'app', 'list', i.toString(), 'page.js'),
      `
      ${type === 'client' ? '"use client";' : ''}
    ${imports.join('\n')}
    ${vars.join('\n')}
  
export default function Page() {
  return <h1>Hello World</h1>
}
  `
    )
  }
}

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

writeToBarrelFiles(packageList, 'client')
writePackageJson(packageList)
