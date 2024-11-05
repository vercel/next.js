import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readdir, writeFile } from 'node:fs/promises'
import execa from 'execa'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const EXAMPLES_DIR = join(__dirname, '../examples')
const NEXT_UPGRADE_DIR = join(
  __dirname,
  '../packages/next-codemod/bin/next-codemod'
)
const EXAMPLES = []

async function updateExamples() {
  const examples = await readdir(EXAMPLES_DIR, { withFileTypes: true })

  for (const example of examples) {
    if (example.isDirectory()) {
      EXAMPLES.push(join(EXAMPLES_DIR, example.name))
    }
  }

  await writeFile(
    join(__dirname, './run-next-upgrade-examples.json'),
    JSON.stringify(EXAMPLES, null, 2)
  )
}

async function runNextUpgrade() {
  let startIndex = process.env.START_INDEX
    ? parseInt(process.env.START_INDEX)
    : 0

  for (let i = startIndex; i < EXAMPLES.length; i++) {
    const example = EXAMPLES[i]
    try {
      await execa('node', [NEXT_UPGRADE_DIR, 'upgrade', 'latest'], {
        cwd: example,
        stdio: 'inherit',
      })
    } catch (error) {
      console.log(`Failed to upgrade example ${example} at index ${i}.`)
      throw error
    }
  }
}

async function main() {
  await updateExamples()
  await runNextUpgrade()
}

main().catch(console.error)
