import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// This compiler is a pinned build-only input, not a consumer runtime dependency.
// eslint-disable-next-line import/no-extraneous-dependencies
import ncc from '@vercel/ncc'

const require = createRequire(import.meta.url)
const directory = dirname(fileURLToPath(import.meta.url))

// src/compiled/*.d.ts supplies build-time types for these generated modules;
// .swcrc excludes those declarations from runtime JavaScript emission.

// Neither pinned plugin publishes an ESLint 10 peer range. Merely wrapping
// React's rules fixes its removed-context-API crash but still makes strict
// consumer installs reject the upstream package. Bundle both plugins and their
// implementation dependencies as build inputs instead: the published config
// owns the compatibility contract, and does not ask consumers to ignore peers,
// install ESLint 9 alongside 10, or modify their package-manager configuration.
// JSX-a11y needs no runtime shim; its enabled rules are tested under both engines.
// NCC also preserves the dependencies' license files in the generated assets.
const plugins = {
  'eslint-plugin-react': '7.37.5',
  'eslint-plugin-jsx-a11y': '6.10.2',
}

for (const [name, version] of Object.entries(plugins)) {
  // These are intentional review tripwires, not supported version ranges.
  // Upstream upgrades must review this build, react-plugin.ts, and the
  // compatibility fixtures, even when a new version happens to bundle cleanly.
  // Once upstream declares and implements ESLint 10 support, remove its bundle
  // after validating normal consumer installation and both engine versions.
  if (require(`${name}/package.json`).version !== version) {
    throw new Error(
      `Review build-plugins.mjs before upgrading ${name}@${version}.`
    )
  }

  const { code, assets } = await ncc(require.resolve(name), {
    minify: true,
    target: 'es2019',
    // React reads the active engine's package metadata when formatting rule
    // reports. Do not bake the build-time ESLint 9 version into that code.
    externals: ['eslint', 'eslint/package.json'],
    license: 'LICENSE',
  })
  const outputDirectory = join(directory, 'dist', 'compiled', name)
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(join(outputDirectory, 'index.js'), code)
  for (const [path, asset] of Object.entries(assets)) {
    const outputPath = join(outputDirectory, path)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, asset.source, { mode: asset.permissions })
  }
}
