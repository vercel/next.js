// Copies the files an agent upgrade hands to the agent into dist/:
// - the upgrade guides (guides/*.md) into dist/guides
// - the Next.js docs those guides reference into dist/docs, renamed from .mdx
//   to .md so agents find them when globbing for *.md
// Bundling them keeps an upgrade on the guides of the @next/upgrade release
// that runs it, even when the app is on an old Next.js release.
import { cp, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = join(packageDir, '../../docs')
const distDir = join(packageDir, 'dist')

// Directories copied whole, and single documents (Future Defaults adoption
// docs in src/future-defaults.ts), relative to the docs root.
const docDirectories = [
  '01-app/02-guides/upgrading',
  '02-pages/02-guides/upgrading',
]
const docFiles = ['01-app/02-guides/migrating-to-cache-components.mdx']

async function copyDoc(relativePath) {
  const destination = join(
    distDir,
    'docs',
    relativePath.replace(/\.mdx$/, '.md')
  )
  await mkdir(dirname(destination), { recursive: true })
  await cp(join(docsDir, relativePath), destination)
}

await cp(join(packageDir, 'guides'), join(distDir, 'guides'), {
  recursive: true,
})

for (const directory of docDirectories) {
  for (const entry of await readdir(join(docsDir, directory))) {
    if (entry.endsWith('.mdx') || entry.endsWith('.md')) {
      await copyDoc(join(directory, entry))
    }
  }
}
for (const file of docFiles) {
  await copyDoc(file)
}
