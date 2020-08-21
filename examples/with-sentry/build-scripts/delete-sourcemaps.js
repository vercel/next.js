// Node script for deleting the source map files that are genereated during a
// production build

const fs = require('fs')
const path = require('path')

async function run() {
  const nextPath = path.join(__dirname, '../.next/')

  // For whatever reason, libraries (del, rimraf) don't seem to work in Vercel,
  // so doing it by hand
  function deleteMaps(dirPath) {
    const childPaths = fs.readdirSync(dirPath)

    childPaths.forEach((child) => {
      const childPath = path.join(dirPath, child)

      if (path.extname(childPath) === '.map') {
        console.log(`Deleting ${childPath}`)
        fs.unlinkSync(childPath)
      } else if (fs.lstatSync(childPath).isDirectory()) {
        deleteMaps(childPath)
      }
    })
  }

  deleteMaps(nextPath)
}

run()
