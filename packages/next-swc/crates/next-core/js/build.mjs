/**
 * Build npm package to be able to embed them in the binary
 */

import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import ncc from '@vercel/ncc'
import { findUp } from 'find-up'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/**
 * @type {{
 *   name: string;
 *   type: "cjs" | "module" | "module-default";
 *   types?: string;
 * }[]}
 */
const packages = [
  {
    name: 'anser',
    type: 'cjs',
  },
  {
    name: 'css.escape',
    type: 'cjs',
    types: 'export = CSS.escape;',
  },
  {
    name: 'platform',
    type: 'cjs',
  },
  {
    name: 'source-map',
    type: 'module',
  },
  {
    name: 'stacktrace-parser',
    type: 'module',
  },
  {
    name: 'strip-ansi',
    type: 'module-default',
  },
]
const externals = Object.fromEntries(
  packages.map((pkg) => [
    pkg.name,
    `@vercel/turbopack-next/compiled/${pkg.name}`,
  ])
)

// adapted from https://github.com/vercel/next.js/blob/8fb5ef18e7958a19874e11b8037ac0f71c48baef/packages/next/taskfile-ncc.js
async function writePackageManifest(packageName, main) {
  // some newer packages fail to include package.json in the exports
  // so we can't reliably use require.resolve here
  let packagePath

  try {
    packagePath = require.resolve(packageName + '/package.json')
  } catch (_) {
    packagePath = await findUp('package.json', {
      cwd: dirname(require.resolve(packageName)),
    })
  }
  const { name, author, license } = require(packagePath)

  const compiledPackagePath = join(__dirname, `src/compiled/${packageName}`)

  const potentialLicensePath = join(dirname(packagePath), './LICENSE')
  if (existsSync(potentialLicensePath)) {
    await writeFile(
      join(compiledPackagePath, 'LICENSE'),
      await readFile(potentialLicensePath, 'utf8')
    )
  } else {
    // license might be lower case and not able to be found on case-sensitive
    // file systems (ubuntu)
    const otherPotentialLicensePath = join(dirname(packagePath), './license')
    if (existsSync(otherPotentialLicensePath)) {
      await writeFile(
        join(compiledPackagePath, 'LICENSE'),
        await readFile(otherPotentialLicensePath, 'utf8')
      )
    }
  }

  await writeFile(
    join(compiledPackagePath, 'package.json'),
    JSON.stringify(
      Object.assign(
        {},
        { name, main: `${basename(main, '.' + extname(main))}` },
        author ? { author } : undefined,
        license ? { license } : undefined
      )
    ) + '\n'
  )
}

async function main() {
  const baseDir = join(__dirname, 'src/compiled')

  await rm(baseDir, {
    force: true,
    recursive: true,
  })

  let types = '/* GENERATED FILE, DO NOT EDIT */\n'

  for (const pkg of packages) {
    const input = require.resolve(pkg.name)

    const outputDir = join(baseDir, pkg.name)
    await mkdir(outputDir, { recursive: true })

    const { code, assets } = await ncc(input, {
      minify: true,
      assetBuilds: true,
      quiet: true,
      externals,
    })

    await writeFile(join(outputDir, 'index.js'), code)

    for (const key in assets) {
      await writeFile(join(outputDir, key), assets[key].source)
    }

    await writePackageManifest(pkg.name, 'index.js')

    types += `\ndeclare module "@vercel/turbopack-next/compiled/${pkg.name}" {\n`
    if (pkg.types) {
      types += `  ${pkg.types}\n`
    } else if (pkg.type === 'module-default') {
      types += `  import m from "${pkg.name}";\n`
      types += `  export default m;\n`
    } else if (pkg.type === 'module') {
      types += `  export * from "${pkg.name}";\n`
    } else if (pkg.type === 'cjs') {
      types += `  import m from "${pkg.name}";\n`
      types += `  export = m;\n`
    } else {
      throw new Error(`unknown package type ${pkg.type} for ${pkg.name}`)
    }
    types += `}\n`

    console.log(`built ${pkg.name}`)
  }

  await writeFile(join(__dirname, 'types', 'compiled.d.ts'), types)
}

main().catch((e) => {
  console.dir(e)
  process.exit(1)
})
