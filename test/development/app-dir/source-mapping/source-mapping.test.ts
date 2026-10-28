import { nextTestSetup } from 'e2e-utils'
import assert from 'node:assert/strict'
import { SourceMap, type SourceMapPayload } from 'node:module'
import { gate, retry } from 'next-test-utils'
import type { CDPSession, Page } from 'playwright'

type DebuggerLocation = {
  scriptId: string
  lineNumber: number
  columnNumber?: number
}

type StackTrace = {
  callFrames: (DebuggerLocation & { url: string })[]
  parent?: StackTrace
  parentId?: { id: string; debuggerId?: string }
}

function sourceContent(
  payload: SourceMapPayload,
  source: string
): string | undefined {
  if ('sections' in payload) {
    for (const section of payload.sections) {
      const content = sourceContent(section.map, source)
      if (content !== undefined) return content
    }
    return undefined
  }
  const index = payload.sources.findIndex(
    (entry) =>
      entry === source || `${payload.sourceRoot ?? ''}${entry}` === source
  )
  return payload.sourcesContent?.[index]
}

class BrowserDebugger {
  private scripts = new Map<string, { url: string; sourceMapURL?: string }>()
  private sourceMaps = new Map<string, SourceMap>()
  readonly warnings: {
    args: { value?: unknown }[]
    stackTrace?: StackTrace
  }[] = []

  constructor(
    readonly session: CDPSession,
    private page: Page
  ) {
    session.on('Debugger.scriptParsed', (script) => {
      this.scripts.set(script.scriptId, script)
    })
    session.on('Runtime.consoleAPICalled', (event) => {
      if (event.type === 'warning') this.warnings.push(event)
    })
  }

  async enable() {
    await this.session.send('Debugger.enable')
    await this.session.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 })
    await this.session.send('Runtime.enable')
  }

  async originalPosition(location: DebuggerLocation) {
    const script = this.scripts.get(location.scriptId)
    assert(
      script?.sourceMapURL,
      `Missing source map for script ${location.scriptId}`
    )
    const mapURL = new URL(
      script.sourceMapURL,
      /^https?:/.test(script.url) ? script.url : this.page.url()
    ).href
    let sourceMap = this.sourceMaps.get(mapURL)
    if (!sourceMap) {
      let payload: SourceMapPayload
      if (mapURL.startsWith('data:')) {
        payload = await (await fetch(mapURL)).json()
      } else {
        const response = await this.page.request.get(mapURL)
        assert(response.ok(), `Unable to load source map: ${mapURL}`)
        payload = await response.json()
      }
      sourceMap = new SourceMap(payload)
      this.sourceMaps.set(mapURL, sourceMap)
    }
    const original = sourceMap.findEntry(
      location.lineNumber,
      location.columnNumber ?? 0
    )
    assert(
      original.originalSource,
      `No original position for ${JSON.stringify(location)}`
    )
    return {
      source: decodeURIComponent(
        new URL(original.originalSource, mapURL).href
      ).replace(/\\/g, '/'),
      line: original.originalLine + 1,
      column: original.originalColumn,
      content: sourceContent(sourceMap.payload, original.originalSource),
    }
  }

  async functionLocation(expression: string) {
    const { result, exceptionDetails } = await this.session.send(
      'Runtime.evaluate',
      { expression, objectGroup: 'source-mapping' }
    )
    assert.equal(exceptionDetails, undefined)
    assert.equal(result.type, 'function')
    assert(result.objectId)
    const { internalProperties } = await this.session.send(
      'Runtime.getProperties',
      { objectId: result.objectId }
    )
    const location = internalProperties?.find(
      (property) => property.name === '[[FunctionLocation]]'
    )
    assert(location?.value, `No function location for ${expression}`)
    return location.value.value as DebuggerLocation
  }

  async close() {
    try {
      await this.session.send('Runtime.releaseObjectGroup', {
        objectGroup: 'source-mapping',
      })
    } finally {
      await this.session.detach()
    }
  }
}

async function captureActionProps(page: Page) {
  await page.addInitScript(() => {
    // Capture the same committed props React DevTools inspects, without an
    // extension or a test-only export of the actions from the fixture.
    const actions = new Map<string, Function>()
    ;(window as any).__sourceMappingActions = actions
    ;(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject(renderer: unknown) {
        const id = this.renderers.size + 1
        this.renderers.set(id, renderer)
        return id
      },
      onCommitFiberRoot(_id: number, root: any) {
        function visit(fiber: any) {
          if (!fiber) return
          if (fiber.type?.name === 'Form') {
            actions.set(fiber.memoizedProps.id, fiber.memoizedProps.action)
          }
          visit(fiber.child)
          visit(fiber.sibling)
        }
        visit(root.current)
      },
      onCommitFiberUnmount() {},
    }
  })
}

describe('source-mapping', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // CDP is only available in Chromium; action execution stays browser-independent.
  // @force-gate chrome
  describe('browser debugger', () => {
    it('maps replayed Server Component warning frames to the original sources', async () => {
      let debug: BrowserDebugger
      await next.browser('/', {
        async beforePageLoad(page) {
          debug = new BrowserDebugger(
            await page.context().newCDPSession(page),
            page
          )
          await debug.enable()
        },
      })
      try {
        await retry(() => {
          expect(
            debug.warnings.some((event) =>
              event.args.some(
                (arg) =>
                  typeof arg.value === 'string' && /(?:^| )foo$/.test(arg.value)
              )
            )
          ).toBe(true)
        })
        const warning = debug!.warnings.find((event) =>
          event.args.some(
            (arg) =>
              typeof arg.value === 'string' && /(?:^| )foo$/.test(arg.value)
          )
        )!
        const frames: StackTrace['callFrames'] = []
        for (let stack = warning.stackTrace; stack; ) {
          frames.push(...stack.callFrames)
          stack =
            stack.parent ??
            (stack.parentId
              ? (
                  await debug!.session.send('Debugger.getStackTrace', {
                    stackTraceId: stack.parentId,
                  })
                ).stackTrace
              : undefined)
        }
        const originals = []
        for (const frame of frames) {
          if (frame.url.startsWith('about://React/')) {
            originals.push(await debug!.originalPosition(frame))
          }
        }
        expect(originals).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source: expect.stringMatching(/\/app\/server-component\.tsx$/),
              line: 2,
              column: 10,
              content: await next.readFile('app/server-component.tsx'),
            }),
            expect.objectContaining({
              source: expect.stringMatching(/\/app\/page\.tsx$/),
              line: 23,
              column: 6,
              content: await next.readFile('app/page.tsx'),
            }),
          ])
        )
      } finally {
        await debug!.close()
      }
    })

    it.each(['/', '/client'])(
      'maps action prop definitions to the original sources on %s',
      async (route) => {
        let debug: BrowserDebugger
        const browser = await next.browser(route, {
          async beforePageLoad(page) {
            await captureActionProps(page)
            debug = new BrowserDebugger(
              await page.context().newCDPSession(page),
              page
            )
            await debug.enable()
          },
        })
        try {
          // Original definition locations: one-based lines, zero-based columns.
          const definitions = [
            ['actions1.ts', 19, 15],
            ['actions2.ts', 3, 15],
            ['actions3.ts', 3, 30],
            ['actions1.ts', 3, 13],
            ['actions1.ts', 7, 22],
            ['actions1.ts', 11, 13],
            ['actions1.ts', 15, 13],
            ...(route === '/'
              ? [
                  ['page.tsx', 9, 18],
                  ['page.tsx', 15, 2],
                  ['page.tsx', 35, 16],
                  ['page.tsx', 43, 16],
                  ['page.tsx', 51, 16],
                ]
              : []),
          ] as [file: string, line: number, column: number][]
          await retry(async () => {
            expect(
              await browser.eval('window.__sourceMappingActions.size')
            ).toBe(definitions.length)
          })
          for (const [index, [file, line, column]] of definitions.entries()) {
            const location = await debug!.functionLocation(
              `window.__sourceMappingActions.get('form-${index + 1}')`
            )
            const original = await debug!.originalPosition(location)
            expect(original).toEqual({
              source: expect.stringMatching(
                new RegExp(`/app/${file.replace('.', '\\.')}$`)
              ),
              line,
              column,
              content: await next.readFile(`app/${file}`),
            })
          }
        } finally {
          await debug!.close()
        }
      }
    )
  })

  it('should work with server actions passed to client components', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#form-1 p').text()).toBe('initial')
    await browser.elementByCss('#form-1 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-1 p').text()).toBe(
        'default exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-2 p').text()).toBe('initial')
    await browser.elementByCss('#form-2 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-2 p').text()).toBe(
        'default exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-3 p').text()).toBe('initial')
    await browser.elementByCss('#form-3 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-3 p').text()).toBe(
        'default exported named function expression'
      )
    })

    expect(await browser.elementByCss('#form-4 p').text()).toBe('initial')
    await browser.elementByCss('#form-4 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-4 p').text()).toBe(
        'exported exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-5 p').text()).toBe('initial')
    await browser.elementByCss('#form-5 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-5 p').text()).toBe(
        'exported named function declaration'
      )
    })

    expect(await browser.elementByCss('#form-6 p').text()).toBe('initial')
    await browser.elementByCss('#form-6 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-6 p').text()).toBe(
        'exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-7 p').text()).toBe('initial')
    await browser.elementByCss('#form-7 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-7 p').text()).toBe(
        'exported named function expression'
      )
    })

    expect(await browser.elementByCss('#form-8 p').text()).toBe('initial')
    await browser.elementByCss('#form-8 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-8 p').text()).toBe(
        'declarator arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-9 p').text()).toBe('initial')
    await browser.elementByCss('#form-9 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-9 p').text()).toBe(
        'function declaration'
      )
    })

    expect(await browser.elementByCss('#form-10 p').text()).toBe('initial')
    await browser.elementByCss('#form-10 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-10 p').text()).toBe(
        'arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-11 p').text()).toBe('initial')
    await browser.elementByCss('#form-11 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-11 p').text()).toBe(
        'anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-12 p').text()).toBe('initial')
    await browser.elementByCss('#form-12 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-12 p').text()).toBe(
        'named function expression'
      )
    })
  })

  it('should work with server actions imported from client components', async () => {
    const browser = await next.browser('/client')

    expect(await browser.elementByCss('#form-1 p').text()).toBe('initial')
    await browser.elementByCss('#form-1 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-1 p').text()).toBe(
        'default exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-2 p').text()).toBe('initial')
    await browser.elementByCss('#form-2 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-2 p').text()).toBe(
        'default exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-3 p').text()).toBe('initial')
    await browser.elementByCss('#form-3 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-3 p').text()).toBe(
        'default exported named function expression'
      )
    })

    expect(await browser.elementByCss('#form-4 p').text()).toBe('initial')
    await browser.elementByCss('#form-4 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-4 p').text()).toBe(
        'exported exported arrow function expression'
      )
    })

    expect(await browser.elementByCss('#form-5 p').text()).toBe('initial')
    await browser.elementByCss('#form-5 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-5 p').text()).toBe(
        'exported named function declaration'
      )
    })

    expect(await browser.elementByCss('#form-6 p').text()).toBe('initial')
    await browser.elementByCss('#form-6 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-6 p').text()).toBe(
        'exported anonymous function expression'
      )
    })

    expect(await browser.elementByCss('#form-7 p').text()).toBe('initial')
    await browser.elementByCss('#form-7 button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#form-7 p').text()).toBe(
        'exported named function expression'
      )
    })
  })

  it('should show an error when client functions are called from server components', async () => {
    const browser = await next.browser('/server-client')

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Attempted to call useClient() from the server but useClient is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
       "environmentLabel": "${(await gate((c) => c.cacheComponents)) ? 'Prerender' : 'Server'}",
       "label": "Runtime Error",
       "source": "app/server-client/page.js (5:12) @ Component
     > 5 |   useClient()
         |            ^",
       "stack": [
         "Component app/server-client/page.js (5:12)",
       ],
     }
    `)
  })
})
