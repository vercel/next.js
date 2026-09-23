// This script must be run with tsx

import { NEXT_DIR, exec } from './pack-util'
import fs from 'fs'
import path from 'path'

const TARBALLS =
  process.platform === 'win32'
    ? `${NEXT_DIR}\\tarballs`
    : `${NEXT_DIR}/tarballs`

const PROJECT_DIR = path.resolve(process.argv[2])

function realPathIfAny(path: fs.PathLike) {
  try {
    return fs.realpathSync(path)
  } catch {
    return null
  }
}
const packages =
  process.platform === 'win32'
    ? {
        next: realPathIfAny(`${PROJECT_DIR}\\node_modules\\next`),
        'next-swc': realPathIfAny(
          `${PROJECT_DIR}\\node_modules\\@next\\swc-${process.platform}-${process.arch}-msvc`
        ),
        'next-mdx': realPathIfAny(`${PROJECT_DIR}\\node_modules\\@next\\mdx`),
        'next-bundle-analyzer': realPathIfAny(
          `${PROJECT_DIR}\\node_modules\\@next\\bundle-anlyzer`
        ),
      }
    : {
        next: realPathIfAny(`${PROJECT_DIR}/node_modules/next`),
        'next-swc': realPathIfAny(`${PROJECT_DIR}/node_modules/@next/swc`),
        'next-mdx': realPathIfAny(`${PROJECT_DIR}/node_modules/@next/mdx`),
        'next-bundle-analyzer': realPathIfAny(
          `${PROJECT_DIR}/node_modules/@next/bundle-anlyzer`
        ),
      }

if (process.platform === 'win32') {
  for (const [key, path] of Object.entries(packages)) {
    if (!path) continue
    exec(`Unpack ${key}`, `tar -xf ${TARBALLS}\\${key}.tar -C ${path}`)
  }
} else {
  for (const [key, path] of Object.entries(packages)) {
    if (!path) continue
    exec(`Unpack ${key}`, `tar -xf '${TARBALLS}/${key}.tar' -C '${path}'`)
  }
}
