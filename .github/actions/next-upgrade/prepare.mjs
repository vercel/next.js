import { randomUUID } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const harness = process.env.NEXT_UPGRADE_HARNESS
if (harness !== 'codex' && harness !== 'claude') {
  throw new Error('Select codex or claude as the upgrade harness.')
}
const hasKey = process.env.NEXT_UPGRADE_HAS_API_KEY === 'true'
const hasOAuth = process.env.NEXT_UPGRADE_HAS_OAUTH_TOKEN === 'true'
if (!hasKey && !(harness === 'claude' && hasOAuth)) {
  throw new Error(
    'Configure the selected harness credential before running the upgrade.'
  )
}
if (harness === 'claude' && hasKey && hasOAuth) {
  throw new Error('Provide either a Claude API key or an OAuth token.')
}

const workspace = realpathSync(process.env.GITHUB_WORKSPACE)
const directory = realpathSync(
  resolve(workspace, process.env.NEXT_UPGRADE_DIRECTORY)
)
const appPath = relative(workspace, directory)
if (appPath === '..' || appPath.startsWith(`..${sep}`) || isAbsolute(appPath)) {
  throw new Error('The app directory must be inside the repository.')
}
const actionDirectory = dirname(fileURLToPath(import.meta.url))
const prompt = readFileSync(join(actionDirectory, 'ci.md'), 'utf8').replaceAll(
  '<app-directory>',
  () => JSON.stringify(directory)
)
const outputs = { directory, prompt }

// Keep package downloads and tool installs writable during the upgrade.
const temporary = mkdtempSync(
  join(process.env.RUNNER_TEMP || tmpdir(), 'next-upgrade-action-')
)
const tools = join(temporary, 'tools')
mkdirSync(join(tools, 'bin'), { recursive: true })
const environment = {
  npm_config_cache: join(temporary, 'npm'),
  npm_config_prefix: tools,
  COREPACK_HOME: join(temporary, 'corepack'),
  XDG_CACHE_HOME: join(temporary, 'cache'),
  XDG_DATA_HOME: join(temporary, 'share'),
  XDG_STATE_HOME: join(temporary, 'state'),
  YARN_GLOBAL_FOLDER: join(temporary, 'yarn'),
  BUN_INSTALL_CACHE_DIR: join(temporary, 'bun'),
}
for (const [name, value] of Object.entries(environment)) {
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`)
}
appendFileSync(process.env.GITHUB_PATH, `${join(tools, 'bin')}\n`)

if (harness === 'codex') {
  const codexHome = join(temporary, 'codex')
  mkdirSync(codexHome)
  const configuration = join(codexHome, 'config.toml')
  writeFileSync(
    configuration,
    `approval_policy = "never"
allow_login_shell = false

[permissions.next-upgrade]
extends = ":workspace"

[permissions.next-upgrade.workspace_roots]
${JSON.stringify(workspace)} = true

[permissions.next-upgrade.filesystem]
${JSON.stringify(temporary)} = "write"
${JSON.stringify(configuration)} = "read"

[permissions.next-upgrade.filesystem.":workspace_roots"]
".git" = "write"

[permissions.next-upgrade.network]
enabled = true
`
  )
  const promptFile = join(temporary, 'ci.md')
  writeFileSync(promptFile, prompt)
  outputs['prompt-file'] = promptFile
  outputs['codex-home'] = codexHome
}

for (const [name, value] of Object.entries(outputs)) {
  const marker = randomUUID()
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<${marker}\n${value}\n${marker}\n`
  )
}
