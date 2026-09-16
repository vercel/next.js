// Run this fixture with the locally built Next.js dev server first.
// AGENT_BROWSER_BINARY=/path/to/agent-browser SELECTION_TEST_URL=http://localhost:3000 \
//   node test/development/app-dir/next-devtools-select-components/verify-webmcp.mjs --leave-open
// --leave-open preserves two selected components for a subsequent headless agent.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const binary = process.env.AGENT_BROWSER_BINARY || 'agent-browser'
const url = process.env.SELECTION_TEST_URL || 'http://127.0.0.1:3217'
const session = process.env.SELECTION_TEST_SESSION || 'selection'
const socketDirectory =
  process.env.AGENT_BROWSER_SOCKET_DIR ||
  join(tmpdir(), 'next-select-components-native-e2e')
const reportPath =
  process.env.SELECTION_TEST_REPORT ||
  join(tmpdir(), 'next-select-components-native-e2e.json')
const screenshotPath =
  process.env.SELECTION_TEST_SCREENSHOT ||
  join(tmpdir(), 'next-select-components-final.png')
const leaveOpen = process.argv.includes('--leave-open')
const toolName = 'nextjs_get_selected_components'
const env = { ...process.env, AGENT_BROWSER_SOCKET_DIR: socketDirectory }
let currentCatalog = { status: 'ready', tools: [] }
const report = {
  binary,
  url,
  session,
  socketDirectory,
  screenshotPath,
  steps: [],
  catalogUpdates: [],
  passed: false,
}

function run(...args) {
  const output = execFileSync(
    binary,
    ['--session', session, '--json', ...args],
    {
      env,
      encoding: 'utf8',
      timeout: 60_000,
    }
  )
  const result = JSON.parse(output)
  assert.equal(result.success, true, JSON.stringify(result))
  report.steps.push({ command: args, data: result.data })
  if (result.data.webmcp) {
    currentCatalog = result.data.webmcp
    report.catalogUpdates.push({ command: args, catalog: currentCatalog })
  }
  return result.data
}

function selectedComponentsTool() {
  assert.equal(currentCatalog.status, 'ready', 'WebMCP must be available')
  return currentCatalog.tools.find((tool) => tool.name === toolName)
}

function accessibleReference(role, name) {
  // Both the Next.js overlay and React Grab renderer use open shadow roots.
  // Accessibility refs target the actual controls across both boundaries.
  const selector = role === 'button' ? 'button' : `[role="${role}"]`
  run(
    'wait',
    '--fn',
    `(() => {
      const roots = [document];
      for (let index = 0; index < roots.length; index++) {
        for (const host of roots[index].querySelectorAll('nextjs-portal, [data-react-grab-frontend]')) {
          if (host.shadowRoot) roots.push(host.shadowRoot);
        }
      }
      return roots.some(root =>
        Array.from(root.querySelectorAll(${JSON.stringify(selector)})).some(element => {
          if ((element.getAttribute('aria-label') || element.textContent.trim()) !== ${JSON.stringify(name)}) return false;
          // React Grab measures a newly mounted menu on the next animation frame.
          // Wait for its final on-screen placement before a coordinate-based click.
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0 &&
            bounds.left >= 0 && bounds.top >= 0 &&
            bounds.right <= innerWidth && bounds.bottom <= innerHeight;
        }));
    })()`
  )
  const { refs } = run('snapshot', '-i')
  const entry = Object.entries(refs).find(
    ([, value]) => value.role === role && value.name === name
  )
  assert.ok(entry, `Missing ${role}: ${name}`)
  return `@${entry[0]}`
}

function clickAccessible(role, name) {
  run('click', accessibleReference(role, name))
}

function selectionAction(name) {
  run('hover', accessibleReference('button', 'Select element'))
  run('mouse', 'down', 'right')
  run('mouse', 'up', 'right')
  clickAccessible('menuitem', name)
}

function readContext() {
  const tool = selectedComponentsTool()
  assert.ok(tool, 'The browser must advertise the selection tool before use')
  const { output, status } = run(
    'webmcp',
    'invoke',
    toolName,
    '--frame',
    tool.frameId,
    '--params',
    '{}'
  )
  assert.equal(status, 'completed')
  return JSON.parse(output.content.find((item) => item.type === 'text').text)
}

function assertComponent(component, name, file, elementId, text) {
  assert.equal(component.name, name)
  assert.equal(component.text, text)
  assert.ok(Number.isInteger(component.id) && component.id > 0)
  assert.ok(component.owners.some((owner) => owner.name === name))
  assert.ok(component.source.file.endsWith(`/app/components/${file}`))
  const fixture = readFileSync(
    new URL(`./app/components/${file}`, import.meta.url),
    'utf8'
  )
  const sourceLine =
    fixture
      .split('\n')
      .findIndex((line) => line.includes(`id="${elementId}"`)) + 1
  assert.equal(component.source.line, sourceLine)
  assert.ok(component.source.column > 0)
}

function selectBoth() {
  run('click', '#hero-title')
  run('click', '#product-title')
  run('press', 'Escape')
  const snapshot = run('snapshot', '-i')
  const tool = selectedComponentsTool()
  assert.ok(
    tool,
    'Normal browser responses must announce selection before metadata lookup'
  )
  const catalog = run('webmcp', 'list', toolName, '--frame', tool.frameId)
  assert.equal(catalog.tools[0].name, toolName)
  // Chrome's CDP representation omits the JavaScript annotation's "Hint" suffix.
  assert.equal(catalog.tools[0].annotations.readOnly, true)
  const context = readContext()
  assert.equal(context.components.length, 2)
  assertComponent(
    context.components[0],
    'HeroCard',
    'hero-card.tsx',
    'hero-title',
    'Less stuff. More possibility.'
  )
  assertComponent(
    context.components[1],
    'ProductCard',
    'product-card.tsx',
    'product-title',
    'The everyday tote'
  )
  assert.notEqual(context.components[0].id, context.components[1].id)
  assert.ok(
    snapshot.snapshot.includes('button "Select element"'),
    'Escape should stop selecting without clearing the selection'
  )
  assert.equal(
    run('snapshot', '-i').webmcp,
    undefined,
    'An unchanged tool catalog should not repeat its announcement'
  )
  return context
}

try {
  report.agentBrowserVersion = execFileSync(binary, ['--version'], {
    env,
    encoding: 'utf8',
    timeout: 10_000,
  }).trim()
  run('open', url)
  run('set', 'viewport', '1440', '1000')
  run(
    'wait',
    '--fn',
    "Boolean(document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dev-tools-button]'))"
  )
  assert.ok(
    !selectedComponentsTool(),
    'The selection tool must not be advertised before selection'
  )
  clickAccessible('button', 'Open Next.js Dev Tools')
  clickAccessible('menuitem', 'Select Components')
  report.initialSelection = selectBoth()

  report.frontend = run(
    'eval',
    `(() => {
      const root = document.querySelector('nextjs-portal').shadowRoot.querySelector('[data-react-grab-frontend]').shadowRoot;
      const toolbar = root.querySelector('[data-react-grab-toolbar]').getBoundingClientRect();
      return {
        canvasCount: root.querySelectorAll('[data-react-grab-overlay-canvas]').length,
        toolbarWidth: toolbar.width,
        toolbarHeight: toolbar.height,
      };
    })()`
  ).result
  assert.equal(report.frontend.canvasCount, 1)
  assert.ok(
    report.frontend.toolbarWidth > 0 && report.frontend.toolbarWidth < 160
  )
  assert.ok(
    report.frontend.toolbarHeight > 0 && report.frontend.toolbarHeight < 80
  )

  clickAccessible('button', 'Select element')
  clickAccessible('button', 'Stop selecting element')
  assert.deepEqual(
    readContext().components.map((component) => component.id),
    report.initialSelection.components.map((component) => component.id),
    'Using the native picker controls must not select the controls themselves'
  )

  const [hero, product] = report.initialSelection.components
  selectionAction(`Remove component ${hero.id}`)
  const remaining = readContext()
  assert.equal(remaining.components.length, 1)
  assert.equal(remaining.components[0].id, product.id)
  assert.equal(remaining.components[0].name, 'ProductCard')

  const updatesBeforeClear = report.catalogUpdates.length
  selectionAction('Clear selection')
  run('snapshot', '-i')
  assert.ok(
    report.catalogUpdates.length > updatesBeforeClear,
    'Normal browser responses must announce removal of the selection tool'
  )
  assert.ok(
    !selectedComponentsTool(),
    'Clearing the last selection must remove its tool from the advertised catalog'
  )
  assert.equal(
    run('snapshot', '-i').webmcp,
    undefined,
    'An unchanged catalog after clearing should not repeat its announcement'
  )

  clickAccessible('button', 'Open Next.js Dev Tools')
  clickAccessible('menuitem', 'Select Components')
  report.finalSelection = selectBoth()
  assert.deepEqual(
    report.finalSelection.components.map((component) => component.id),
    [hero.id, product.id],
    'Reselecting the same mounted elements should retain their IDs'
  )
  run('screenshot', screenshotPath)
  report.passed = true
} finally {
  if (!leaveOpen) run('close')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.log(
  JSON.stringify({
    passed: report.passed,
    report: reportPath,
    screenshot: screenshotPath,
    session,
    socketDirectory,
    leftOpen: leaveOpen,
  })
)
