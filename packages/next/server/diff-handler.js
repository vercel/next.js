import os from 'os'
import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import rawBody from 'raw-body'
import { promisify } from 'util'
import { exec } from 'child_process'
import AnsiToHtml from 'ansi-to-html'
import { recursiveDelete } from '../lib/recursive-delete'

const tmpDir = os.tmpdir()
const mkdirP = promisify(mkdirp)
const execP = promisify(exec)
const rmdir = promisify(fs.rmdir)
const writeFile = promisify(fs.writeFile)
const endpointRegex = /\/_next\/diffHandler/

const convert = new AnsiToHtml({ newline: true, escapeXML: true })

export default async function diffHandler (req, res) {
  if (req.method !== 'POST' || !req.url.match(endpointRegex)) return
  let finished = false
  const workDir = path.join(tmpDir, `__next_diff_${new Date().getTime()}`)

  try {
    await mkdirP(workDir)
    await execP(`git init`, { cwd: workDir })

    // limit to 1MB
    const body = await rawBody(req, { limit: 1024 * 1024, encoding: 'utf8' })
    const { ssr, csr } = JSON.parse(body)
    const htmlFile = path.join(workDir, 'data.html')

    await writeFile(htmlFile, ssr, 'utf8')
    await execP(`git add data.html`, { cwd: workDir })

    await writeFile(htmlFile, csr, 'utf8')
    const { stdout } = await execP(
      `git diff --word-diff --color --minimal data.html`,
      { cwd: workDir, encoding: 'buffer' }
    )

    // remove first 4 lines with git meta
    let ansiDiff = stdout.toString().split('\n')
    ansiDiff.splice(0, 4)
    ansiDiff = ansiDiff.join('\n')

    finished = true
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ diff: convert.toHtml(ansiDiff) }))
  } catch (err) {
    finished = true
    res.statusCode = 500
    res.end(err.message)
    console.error('Error occurred generating diff', err)
  }

  try {
    await recursiveDelete(workDir)
    await rmdir(workDir)
  } catch (_) {}

  return finished
}
