// Setup-only validity controls. This script and its copies are removed before the agent starts.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { checkApp } = require('./runtime.cjs')
const root = '/tmp/next-upgrade-tools'
const scenario = JSON.parse(fs.readFileSync(`${root}/scenario.json`, 'utf8'))
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error || result.status !== 0)
    throw new Error(
      `Control command failed: ${command} ${args.join(' ')}\n${result.stderr || result.error}`
    )
  return result.stdout
}
async function controls() {
  if (!scenario.major) return
  const directory = `${root}/control-app`
  fs.cpSync(process.cwd(), directory, {
    recursive: true,
    filter: (source) =>
      !['.git', '.next', '__agent_eval__'].includes(path.basename(source)),
  })
  try {
    const baseline = await checkApp(directory, true)
    run('git', ['init'], directory)
    run('git', ['config', 'user.name', 'Upgrade eval'], directory)
    run(
      'git',
      ['config', 'user.email', 'upgrade-eval@example.invalid'],
      directory
    )
    run('git', ['add', '.'], directory)
    run('git', ['commit', '-m', 'Prepare migration control fixture'], directory)
    const codemod = `${root}/codemod/node_modules/@next/codemod/bin/next-codemod.js`
    const output = run(
      process.execPath,
      [
        codemod,
        'upgrade',
        scenario.target,
        '--yes',
        '--skip-adoption',
      ],
      directory
    )
    const viewerPath = path.join(directory, 'lib/viewer.ts')
    const viewer = fs.readFileSync(viewerPath, 'utf8')
    if (!viewer.includes('@next-codemod-error'))
      throw new Error(
        'SETUP_BLOCKED: actual codemod did not leave the required contextual finding'
      )
    fs.writeFileSync(
      viewerPath,
      viewer.replace(/\/\*[^]*?@next-codemod-error[^]*?\*\//g, '')
    )
    let markerOnlyFailed = false
    try {
      await checkApp(directory, true)
    } catch {
      markerOnlyFailed = true
    }
    if (!markerOnlyFailed)
      throw new Error('SETUP_BLOCKED: deleting only the marker passes')
    fs.writeFileSync(
      viewerPath,
      "import { cookies } from 'next/headers'\nexport async function readViewer() { return (await cookies()).get('viewer')?.value ?? 'Guest' }\n"
    )
    const pagePath = path.join(directory, 'app/page.tsx')
    fs.writeFileSync(
      pagePath,
      fs
        .readFileSync(pagePath, 'utf8')
        .replace(
          'export default function Page()',
          'export default async function Page()'
        )
        .replace('const viewer = readViewer()', 'const viewer = await readViewer()')
    )
    let unmarkedRepairRequired = false
    try {
      await checkApp(directory, true)
    } catch (error) {
      if (!String(error).includes('Image quality contract')) throw error
      unmarkedRepairRequired = true
    }
    if (!unmarkedRepairRequired)
      throw new Error(
        'SETUP_BLOCKED: contextual repair alone already preserves the unmarked image behavior'
      )
    const configPath = path.join(directory, 'next.config.js')
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace(
          'export default {',
          'export default { images: { qualities: [60, 75] },'
        )
    )
    fs.rmSync(path.join(directory, '.next'), { recursive: true, force: true })
    const repaired = await checkApp(directory, true)
    fs.writeFileSync(
      `${root}/controls.json`,
      JSON.stringify({
        baseline,
        emittedMarker: true,
        markerOnlyFailed,
        unmarkedRepairRequired,
        repaired,
        codemodOutput: output,
      })
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
controls().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
