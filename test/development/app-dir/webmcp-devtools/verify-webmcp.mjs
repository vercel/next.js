// Start this fixture with the locally built Next.js dev server first:
// AGENT_BROWSER_BINARY=/path/to/agent-browser WEBMCP_TEST_URL=http://127.0.0.1:3231/tools \
//   node test/development/app-dir/webmcp-devtools/verify-webmcp.mjs --leave-open
// Uses native Chrome WebMCP without a modelContext stub. --leave-open retains
// the browser session for a following headless agent; fixture edits are restored.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const binary = process.env.AGENT_BROWSER_BINARY || 'agent-browser'
const url = process.env.WEBMCP_TEST_URL || 'http://127.0.0.1:3231/tools'
const session = process.env.WEBMCP_TEST_SESSION || `next-webmcp-${process.pid}`
const socketDirectory =
  process.env.WEBMCP_TEST_SOCKET_DIR || mkdtempSync(join(tmpdir(), 'nwm-'))
const reportPath =
  process.env.WEBMCP_TEST_REPORT ||
  join(tmpdir(), 'next-webmcp-devtools-native.json')
const leaveOpen = process.argv.includes('--leave-open')
const env = { ...process.env, AGENT_BROWSER_SOCKET_DIR: socketDirectory }
const fixtureDirectory = fileURLToPath(new URL('.', import.meta.url))
const counterPath = new URL('./app/counter.tsx', import.meta.url)
const unvisitedPath = new URL('./app/unvisited/page.tsx', import.meta.url)
const originalCounter = readFileSync(counterPath, 'utf8')
const originalUnvisited = readFileSync(unvisitedPath, 'utf8')
const missingModule = './native-webmcp-missing-module'
const expectedTools = [
  'nextjs_compile_route',
  'nextjs_inspect',
  'pause_hmr',
  'resume_hmr',
].sort()
let catalog = { status: 'unavailable', tools: [] }
let pauseRequested = false
let filesPatched = false
let failure
const report = {
  binary,
  url,
  session,
  socketDirectory,
  steps: [],
  catalogUpdates: [],
  cleanupErrors: [],
  passed: false,
}

function run(...args) {
  const output = execFileSync(
    binary,
    ['--session', session, '--json', ...args],
    { env, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }
  )
  const response = JSON.parse(output)
  assert.equal(response.success, true, JSON.stringify(response))
  const data = response.data
  report.steps.push({ command: args, data })
  if (data.webmcp) {
    catalog = data.webmcp
    report.catalogUpdates.push({ command: args, catalog })
  }
  return data
}

// Each attempt makes a real browser/tool request. Retry only assertions whose
// result can change as the dev server processes a file edit or page render.
function eventually(description, check) {
  const deadline = Date.now() + 30_000
  let lastError
  do {
    try {
      return check()
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error
      lastError = error
    }
  } while (Date.now() < deadline)
  throw new Error(description, { cause: lastError })
}

function invoke(name, params = {}) {
  assert.equal(catalog.status, 'ready', 'Native WebMCP must be available')
  const tool = catalog.tools.find((entry) => entry.name === name)
  assert.ok(tool, `The browser must advertise ${name} before invocation`)
  const result = run(
    'webmcp',
    'invoke',
    name,
    '--frame',
    tool.frameId,
    '--params',
    JSON.stringify(params)
  )
  assert.equal(result.status, 'completed')
  assert.notEqual(result.output.isError, true, JSON.stringify(result.output))
  const text = result.output.content.find((item) => item.type === 'text')?.text
  assert.equal(typeof text, 'string')
  return name === 'pause_hmr' || name === 'resume_hmr' ? text : JSON.parse(text)
}

function inspect(view, params = {}) {
  return invoke('nextjs_inspect', { view, ...params })
}

function readPage() {
  return run(
    'eval',
    `({
      version: document.querySelector('#version')?.textContent,
      counter: document.querySelector('#counter')?.textContent,
      htmlRequestId: self.__next_r,
      actionId: document.querySelector('input[name^="$ACTION_ID_"]')?.name.slice('$ACTION_ID_'.length),
    })`
  ).result
}

function assertPage(version) {
  const page = readPage()
  assert.equal(page.version, version)
  assert.equal(page.counter, 'Count: 1')
  return page
}

try {
  report.agentBrowserVersion = execFileSync(binary, ['--version'], {
    env,
    encoding: 'utf8',
    timeout: 10_000,
  }).trim()
  const version = report.agentBrowserVersion.match(/(\d+)\.(\d+)\.(\d+)/)
  assert.ok(version, 'agent-browser must report a version')
  assert.ok(
    Number(version[1]) > 0 || Number(version[2]) >= 38,
    'agent-browser >= 0.38.0 is required for automatic WebMCP discovery'
  )
  assert.ok(originalCounter.includes('version-1'), 'Use the unmodified fixture')
  run('open', url)
  run('wait', '--fn', "Boolean(document.querySelector('#counter'))")
  eventually('Next.js tools were not automatically advertised', () => {
    run('snapshot', '-i')
    assert.equal(catalog.status, 'ready')
    assert.deepEqual(
      catalog.tools.map((tool) => tool.name).sort(),
      expectedTools
    )
  })
  report.initialCatalog = catalog
  for (const name of expectedTools) {
    const tool = catalog.tools.find((entry) => entry.name === name)
    run('webmcp', 'list', name, '--frame', tool.frameId)
  }

  report.project = inspect('project')
  assert.equal(
    realpathSync(report.project.projectPath),
    realpathSync(fixtureDirectory)
  )
  assert.equal(report.project.bundler, 'turbopack')
  assert.deepEqual(report.project.capabilities, {
    compilation: true,
    compileRoute: true,
    requestInsights: true,
  })
  report.routes = inspect('routes')
  assert.ok(report.routes.appRouter.includes('/unvisited'))
  assert.ok(report.routes.pagesRouter.includes('/legacy'))
  assert.deepEqual(inspect('routes', { routerType: 'pages' }), {
    pagesRouter: ['/legacy'],
  })
  report.page = eventually(
    'Current document source files were not available',
    () => {
      const page = inspect('page')
      assert.equal(page.sessions.length, 1)
      assert.equal(page.sessions[0].routerType, 'app')
      assert.ok(
        page.sessions[0].segments.some(
          (segment) => segment.path === 'app/page.tsx'
        )
      )
      return page
    }
  )
  assert.deepEqual(inspect('errors'), { configErrors: [], sessionErrors: [] })

  report.logs = inspect('logs')
  assert.ok(statSync(report.logs.logFilePath).isFile())
  const logMarker = `native-webmcp-log-${process.pid}`
  run('eval', `console.log(${JSON.stringify(logMarker)})`)
  eventually('Browser log was not written with server MCP disabled', () => {
    run('snapshot', '-i')
    assert.ok(readFileSync(report.logs.logFilePath, 'utf8').includes(logMarker))
  })
  const initialPage = readPage()
  assert.ok(
    initialPage.actionId,
    'The page must expose its real Server Action ID'
  )
  report.action = inspect('server-action', { actionId: initialPage.actionId })
  assert.equal(report.action.actionId, initialPage.actionId)
  assert.equal(report.action.functionName, 'saveAction')
  assert.ok(report.action.filename.includes('app/actions.ts'))
  report.requests = eventually(
    'Current document request insights were not captured',
    () => {
      const data = inspect('requests')
      assert.ok(data.requests.length > 0)
      assert.ok(
        data.requests.every(
          (request) => request.htmlRequestId === initialPage.htmlRequestId
        )
      )
      return data
    }
  )

  run('click', '#counter')
  assertPage('version-1')
  report.baselineCompilation = inspect('compilation')
  assert.ok(
    report.baselineCompilation.issues.every((issue) =>
      ['warning', 'info', 'log'].includes(issue.severity)
    ),
    'The fixture must start without compilation errors'
  )
  pauseRequested = true
  report.pause = invoke('pause_hmr')
  filesPatched = true
  writeFileSync(counterPath, originalCounter.replace('version-1', 'version-2'))
  writeFileSync(
    unvisitedPath,
    `import '${missingModule}'\n${originalUnvisited}`
  )
  report.brokenCompilation = eventually(
    'Compilation did not detect the unvisited route error',
    () => {
      const data = inspect('compilation')
      assert.ok(
        data.issues.some(
          (issue) =>
            issue.filePath.includes('app/unvisited/page.tsx') &&
            JSON.stringify(issue).includes('native-webmcp-missing-module')
        )
      )
      return data
    }
  )
  report.pausedPage = assertPage('version-1')
  assert.deepEqual(inspect('errors'), { configErrors: [], sessionErrors: [] })
  report.brokenRoute = invoke('nextjs_compile_route', {
    routeSpecifier: '/unvisited',
  })
  assert.equal(report.brokenRoute.routeSpecifier, '/unvisited')
  assert.ok(
    report.brokenRoute.issues.some((issue) =>
      JSON.stringify(issue).includes('native-webmcp-missing-module')
    )
  )

  writeFileSync(unvisitedPath, originalUnvisited)
  report.fixedRoute = eventually(
    'Unvisited route did not compile after the fix',
    () => {
      const data = invoke('nextjs_compile_route', {
        routeSpecifier: '/unvisited',
      })
      assert.deepEqual(data, { routeSpecifier: '/unvisited', issues: [] })
      return data
    }
  )
  report.fixedCompilation = eventually(
    'Project compilation did not return to its initial state',
    () => {
      const data = inspect('compilation')
      // A local framework checkout may have pre-existing dynamic-import
      // warnings. The edit must introduce no diagnostics beyond that baseline.
      assert.deepEqual(
        data.issues.map((issue) => JSON.stringify(issue)).sort(),
        report.baselineCompilation.issues
          .map((issue) => JSON.stringify(issue))
          .sort()
      )
      return data
    }
  )
  assertPage('version-1')
  report.resume = invoke('resume_hmr')
  run(
    'wait',
    '--fn',
    "document.querySelector('#version')?.textContent === 'version-2'"
  )
  report.resumedPage = assertPage('version-2')
  report.finalErrors = inspect('errors')
  assert.deepEqual(report.finalErrors, { configErrors: [], sessionErrors: [] })
  report.passed = true
} catch (error) {
  failure = error
  report.error = error.stack || String(error)
} finally {
  // Restore source even when a tool failed or Chrome disconnected. Resuming is
  // idempotent and is attempted whenever pause could have reached the browser.
  for (const cleanup of [
    () => {
      if (filesPatched) writeFileSync(unvisitedPath, originalUnvisited)
    },
    () => {
      if (filesPatched) writeFileSync(counterPath, originalCounter)
    },
    () => {
      if (pauseRequested) invoke('resume_hmr')
    },
    () => {
      if (filesPatched && leaveOpen) {
        run(
          'wait',
          '--fn',
          "document.querySelector('#version')?.textContent === 'version-1'"
        )
        report.restoredPage = assertPage('version-1')
      }
    },
    () => {
      if (!leaveOpen) run('close')
    },
  ]) {
    try {
      cleanup()
    } catch (error) {
      report.cleanupErrors.push(error.message || String(error))
      failure ??= error
    }
  }
  report.passed = report.passed && !failure
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.log(
  JSON.stringify({
    passed: report.passed,
    report: reportPath,
    session,
    socketDirectory,
    leftOpen: leaveOpen,
  })
)
if (failure) throw failure
