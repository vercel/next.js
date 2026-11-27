// Runs the docs converter in plain Node for bundled-docs-markdown.test.ts. The
// converter loads an ESM-only MDX parser, which Jest's module system cannot
// import, so the test calls this script and reads its JSON output.
//
// stdin: { "source", "relativePath", "shared": { "<docs path>": "<mdx>" } }
//     or { "corpus": true } for every docs and error page in the repo.
const { readFileSync } = require('fs')
const { join } = require('path')
const glob = require('glob')
const {
  createConverter,
  docsPath,
} = require('../../packages/next/taskfile-docs.js')

const repoRoot = join(__dirname, '../..')
const docsRoot = join(repoRoot, 'docs')
const errorsRoot = join(repoRoot, 'errors')

async function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const toMarkdown = await createConverter()

  if (!input.corpus) {
    const shared = input.shared ?? {}
    return toMarkdown(input.source, {
      relativePath: input.relativePath,
      readSource: (path) => shared[path] ?? null,
    })
  }

  const sources = new Map()
  for (const file of glob.sync('**/*.mdx', { cwd: docsRoot })) {
    sources.set(docsPath(file), readFileSync(join(docsRoot, file), 'utf8'))
  }
  const readSource = (path) =>
    sources.get(path) ?? sources.get(`${path}/index`) ?? null
  const pages = [
    ...glob
      .sync('**/*.mdx', { cwd: docsRoot })
      .map((file) => ({ root: docsRoot, file, name: `docs/${file}` })),
    ...glob.sync('*.mdx', { cwd: errorsRoot }).map((file) => ({
      root: errorsRoot,
      file: `messages/${file}`,
      name: `errors/${file}`,
    })),
  ]
  return pages.map(({ root, file, name }) => {
    const source = readFileSync(
      join(root, root === errorsRoot ? file.slice('messages/'.length) : file),
      'utf8'
    )
    const shared = source
      .match(/^---\n[\s\S]*?\n---\n/)?.[0]
      .match(/^source:\s*(\S+)\s*$/m)
    return {
      name,
      file,
      source,
      output: toMarkdown(source, { relativePath: file, readSource }),
      // Whether a page that shares content found the page it names.
      sharedFound: shared ? readSource(shared[1]) !== null : null,
    }
  })
}

main().then(
  (result) => process.stdout.write(JSON.stringify(result)),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
