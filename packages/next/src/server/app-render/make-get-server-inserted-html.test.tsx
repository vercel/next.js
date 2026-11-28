/**
 * @jest-environment node
 */
/* eslint-disable @next/internal/no-ambiguous-jsx -- test renders with React Client */
import React, { Suspense, type JSX } from 'react'
import { renderToString } from 'react-dom/server'
import { HTTP_ERROR_FALLBACK_ERROR_CODE } from '../../client/components/http-access-fallback/http-access-fallback'
import { useServerInsertedHTML } from '../../shared/lib/server-inserted-html.shared-runtime'
import type { ClientTraceDataEntry } from '../lib/trace/tracer'
import { createServerInsertedHTML } from './server-inserted-html'
import { makeGetServerInsertedHTML } from './make-get-server-inserted-html'
import { renderToWebFizzStream } from './stream-ops'

// Render with `renderToString` so the output can be asserted on, and count the
// calls to tell whether `getServerInsertedHTML` skipped rendering. Both
// renderers share one mock so this is independent of __NEXT_USE_NODE_STREAMS.
jest.mock('./stream-ops', () => {
  const { renderToString: mockRenderToString } =
    jest.requireActual('react-dom/server')
  const mockRenderToFizzStream = jest.fn(async (element: unknown) => ({
    stream: mockRenderToString(element),
  }))
  return {
    renderToNodeFizzStream: mockRenderToFizzStream,
    renderToWebFizzStream: mockRenderToFizzStream,
    streamToString: async (stream: string) => stream,
  }
})

const renderToFizzStream = jest.mocked(renderToWebFizzStream)

function Insert({ callback }: { callback: () => React.ReactNode }) {
  useServerInsertedHTML(callback)
  return null
}

function RendersNothing() {
  return null
}

function setup(
  callbacks: Array<() => React.ReactNode>,
  {
    polyfills = [],
    serverCapturedErrors = [],
    tracingMetadata,
  }: {
    polyfills?: JSX.IntrinsicElements['script'][]
    serverCapturedErrors?: unknown[]
    tracingMetadata?: ClientTraceDataEntry[]
  } = {}
) {
  const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
    createServerInsertedHTML()

  // Register the callbacks the same way that user code does.
  renderToString(
    <ServerInsertedHTMLProvider>
      <>
        {callbacks.map((callback, index) => (
          <Insert key={index} callback={callback} />
        ))}
      </>
    </ServerInsertedHTMLProvider>
  )

  return {
    renderServerInsertedHTML,
    getServerInsertedHTML: makeGetServerInsertedHTML({
      polyfills,
      renderServerInsertedHTML,
      serverCapturedErrors,
      tracingMetadata,
      basePath: '',
    }),
  }
}

describe('getServerInsertedHTML', () => {
  beforeEach(() => {
    renderToFizzStream.mockClear()
  })

  it.each<[string, () => React.ReactNode]>([
    ['null', () => null],
    ['undefined', () => undefined],
    ['false', () => false],
    ['true', () => true],
    ['an empty string', () => ''],
    ['an empty array', () => []],
    ['an empty Fragment', () => <></>],
    ['a Fragment with an empty array', () => <>{[]}</>],
    ['nested empty Fragments', () => <>{<>{[null, [], false]}</>}</>],
  ])('skips rendering when a callback returns %s', async (_, callback) => {
    const { renderServerInsertedHTML, getServerInsertedHTML } = setup([
      callback,
    ])

    expect(renderServerInsertedHTML()).toEqual([])
    expect(await getServerInsertedHTML()).toBe('')
    expect(renderToFizzStream).not.toHaveBeenCalled()
  })

  it('only renders the flushes that insert something', async () => {
    // Like CSS-in-JS registries, return `null` when no new styles were added.
    let pendingStyles = ['.a{color:red}']
    const callback = jest.fn(() => {
      const styles = pendingStyles
      pendingStyles = []
      return styles.length > 0 ? <style>{styles.join('')}</style> : null
    })
    const { getServerInsertedHTML } = setup([callback])

    expect(await getServerInsertedHTML()).toBe('<style>.a{color:red}</style>')
    expect(await getServerInsertedHTML()).toBe('')
    pendingStyles = ['.b{color:blue}']
    expect(await getServerInsertedHTML()).toBe('<style>.b{color:blue}</style>')
    expect(await getServerInsertedHTML()).toBe('')

    expect(callback).toHaveBeenCalledTimes(4)
    expect(renderToFizzStream).toHaveBeenCalledTimes(2)
  })

  it('calls every callback once per flush in registration order', async () => {
    const calls: string[] = []
    const { getServerInsertedHTML } = setup([
      () => {
        calls.push('a')
        return null
      },
      () => {
        calls.push('b')
        return <style>{'.b{}'}</style>
      },
      () => {
        calls.push('c')
        return <>{[]}</>
      },
    ])

    await getServerInsertedHTML()
    await getServerInsertedHTML()

    expect(calls).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
  })

  it.each<[string, () => React.ReactNode]>([
    ['0', () => 0],
    ['a string', () => 'x'],
    ['whitespace', () => ' '],
    ['an empty Suspense boundary', () => <Suspense>{null}</Suspense>],
    ['an element', () => <style>{'.a{}'}</style>],
    [
      'a Fragment with an element',
      () => <>{[<style key="a">{'.a{}'}</style>]}</>,
    ],
    ['an array with text', () => [null, 'x']],
    // Components are never called to find out whether they render anything.
    ['a component element', () => <RendersNothing />],
  ])('renders when a callback returns %s', async (_, callback) => {
    const { getServerInsertedHTML } = setup([callback])

    expect(await getServerInsertedHTML()).toBe(
      renderToString(<>{callback()}</>)
    )
    expect(renderToFizzStream).toHaveBeenCalledTimes(1)
  })

  it('leaves out empty results without changing the rendered HTML', async () => {
    const callbacks = [
      () => 'a',
      () => null,
      () => 'b',
      () => <>{[]}</>,
      () => <style>{'.c{}'}</style>,
      () => '',
      () => 'd',
    ]
    const { renderServerInsertedHTML, getServerInsertedHTML } = setup(callbacks)

    expect(renderServerInsertedHTML().map((element) => element.key)).toEqual([
      '__next_server_inserted__0',
      '__next_server_inserted__2',
      '__next_server_inserted__4',
      '__next_server_inserted__6',
    ])
    expect(await getServerInsertedHTML()).toBe(
      renderToString(
        <>
          {callbacks.map((callback, index) => (
            <React.Fragment key={index}>{callback()}</React.Fragment>
          ))}
        </>
      )
    )
  })

  it('still renders polyfills, trace meta tags and error meta tags', async () => {
    const serverCapturedErrors: unknown[] = []
    const { getServerInsertedHTML } = setup([() => null], {
      polyfills: [{ src: '/polyfill.js', noModule: true }],
      tracingMetadata: [{ key: 'traceparent', value: 'trace-id' }],
      serverCapturedErrors,
    })

    const firstFlush = await getServerInsertedHTML()
    expect(firstFlush).toContain('/polyfill.js')
    expect(firstFlush).toContain('name="traceparent"')
    expect(await getServerInsertedHTML()).toBe('')

    serverCapturedErrors.push(
      Object.assign(new Error('not found'), {
        digest: `${HTTP_ERROR_FALLBACK_ERROR_CODE};404`,
      })
    )
    expect(await getServerInsertedHTML()).toContain('name="robots"')
    expect(await getServerInsertedHTML()).toBe('')

    expect(renderToFizzStream).toHaveBeenCalledTimes(2)
  })
})
