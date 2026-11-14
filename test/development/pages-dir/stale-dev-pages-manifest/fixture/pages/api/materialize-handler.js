import { copyFile, mkdir } from 'fs/promises'
import path from 'path'

const HANDLER_FIXTURE_PATH = path.join(
  process.cwd(),
  'page-sources/example-rewritten-page.js'
)
const HANDLER_PAGE_PATH = path.join(
  process.cwd(),
  'pages/docs/_handlers/example.js'
)

export default async function materializeHandler(_req, res) {
  // Materialize the rewritten page only when the test asks for it.
  await mkdir(path.dirname(HANDLER_PAGE_PATH), { recursive: true })
  await copyFile(HANDLER_FIXTURE_PATH, HANDLER_PAGE_PATH)

  // The client only checks that the request succeeded.
  res.status(204).end()
}
