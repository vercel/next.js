import path from 'path'
import glob from 'glob-promise'

const nextPagesDir = path.join(__dirname, '..', '..', '..', 'pages')

export async function getPages (dir, {dev, isServer}) {
  const pageFiles = await getPageFiles(dir, {dev, isServer})

  return getPageEntries(pageFiles, {isServer})
}

async function getPageFiles (dir, {dev, isServer}) {
  let pages

  if (dev) {
    pages = await glob(isServer ? 'pages/+(_document|_error).+(js|jsx)' : 'pages/_error.+(js|jsx)', { cwd: dir })
  } else {
    pages = await glob(isServer ? 'pages/**/*.+(js|jsx)' : 'pages/**/!(_document)*.+(js|jsx)', { cwd: dir })
  }

  return pages
}

export function getPageEntries (pageFiles, {isServer}) {
  const entries = {}
  const bundleLocation = 'bundles'
  for (const p of pageFiles) {
    entries[path.join(bundleLocation, p.replace('.jsx', '.js'))] = [`./${p}`]
  }

  // The default pages (_document.js and _error.js) are only added when they're not provided by the user
  const defaultPages = [
    '_error.js',
    isServer && '_document.js'
  ].filter(Boolean)
  for (const p of defaultPages) {
    const entryName = path.join(bundleLocation, 'pages', p)
    if (!entries[entryName]) {
      entries[entryName] = path.join(nextPagesDir, p)
    }
  }

  return entries
}
