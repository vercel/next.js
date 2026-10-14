/* eslint-disable import/no-extraneous-dependencies -- Build tooling only; not shipped as runtime code. */
const { rollup } = require('rollup')
const { dts } = require('rollup-plugin-dts')
const { join, dirname } = require('node:path')
const { readFile, writeFile } = require('node:fs/promises')
const { createRequire } = require('node:module')

async function build() {
  const output = join(__dirname, '../../compiled/next-test-primitives')
  const bundle = await rollup({
    input: join(__dirname, 'index.d.ts'),
    plugins: [dts({ respectExternal: true })],
    external: ['chai'],
    onwarn(warning, warn) {
      if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message)
      warn(warning)
    },
  })
  try {
    await bundle.write({ file: join(output, 'index.d.ts'), format: 'es' })
  } finally {
    await bundle.close()
  }
  const diffBundle = await rollup({
    input: join(__dirname, 'diff/index.d.ts'),
    plugins: [dts({ respectExternal: true })],
    onwarn(warning, warn) {
      if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message)
      warn(warning)
    },
  })
  try {
    await diffBundle.write({
      file: join(output, 'diff/index.d.ts'),
      format: 'es',
    })
  } finally {
    await diffBundle.close()
  }

  const declarationPath = join(output, 'index.d.ts')
  await writeFile(
    declarationPath,
    (await readFile(declarationPath, 'utf8'))
      .replaceAll("from 'chai'", "from './chai'")
      .replaceAll(/\bChai\b/g, 'NextTestChai')
  )
  const chaiManifest = createRequire(
    require.resolve('@vitest/expect/package.json')
  ).resolve('@types/chai/package.json')
  const chaiRequire = createRequire(chaiManifest)
  const chaiTypes = await readFile(
    join(dirname(chaiManifest), 'index.d.ts'),
    'utf8'
  )
  await writeFile(
    join(output, 'chai.d.ts'),
    chaiTypes
      .replaceAll(/\bChai\b/g, 'NextTestChai')
      .replace('require("deep-eql")', 'require("./deep-eql")')
      .replace('from "assertion-error"', 'from "./assertion-error"')
  )
  await writeFile(
    join(output, 'deep-eql.d.ts'),
    await readFile(
      join(
        dirname(chaiRequire.resolve('@types/deep-eql/package.json')),
        'index.d.ts'
      )
    )
  )
  await writeFile(
    join(output, 'assertion-error.d.ts'),
    await readFile(
      join(dirname(chaiRequire.resolve('assertion-error')), 'index.d.ts')
    )
  )

  // NCC's license discovery omits some concatenated ESM modules. Preserve all
  // production dependency licenses explicitly, including declaration dependencies.
  const licenses = new Map()
  async function collect(name, from) {
    const resolver = createRequire(from)
    let manifest
    try {
      manifest = resolver.resolve(`${name}/package.json`)
    } catch {
      let directory = dirname(resolver.resolve(name))
      while (true) {
        try {
          const candidate = join(directory, 'package.json')
          const pkg = JSON.parse(await readFile(candidate, 'utf8'))
          if (pkg.name === name) {
            manifest = candidate
            break
          }
        } catch {}
        const parent = dirname(directory)
        if (parent === directory)
          throw new Error(`Missing manifest for ${name}`)
        directory = parent
      }
    }
    const pkg = JSON.parse(await readFile(manifest, 'utf8'))
    const key = `${pkg.name}@${pkg.version}`
    if (licenses.has(key)) return
    let license
    for (const file of [
      'LICENSE',
      'LICENSE.md',
      'LICENCE',
      'license',
      'license.md',
    ]) {
      try {
        license = await readFile(join(dirname(manifest), file), 'utf8')
        break
      } catch {}
    }
    if (!license) throw new Error(`Missing license for ${key}`)
    licenses.set(key, license)
    for (const dependency of Object.keys(pkg.dependencies ?? {}))
      await collect(dependency, manifest)
  }
  for (const name of ['@vitest/expect', '@vitest/spy', '@vitest/snapshot'])
    await collect(name, __filename)
  await writeFile(
    join(output, 'LICENSE'),
    [...licenses]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, license]) => `${name}\n\n${license}`)
      .join('\n\n')
  )
  licenses.clear()
  await collect('@vitest/utils', __filename)
  await writeFile(
    join(output, 'diff/LICENSE'),
    [...licenses]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, license]) => `${name}\n\n${license}`)
      .join('\n\n')
  )
}

build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
