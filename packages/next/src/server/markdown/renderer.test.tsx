/* eslint-disable @next/internal/no-ambiguous-jsx -- Test fixtures use concise JSX trees to exercise React-to-Markdown instrumentation. */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  markReactNode,
  renderHtmlToMarkdown,
  type MarkdownSegmentDefinition,
} from '../../../../next-markdown/src'

describe('markdown renderer', () => {
  it('serializes basic markdown blocks', async () => {
    const markdown = await renderHtmlToMarkdown(
      [
        '<h1>Hello</h1>',
        '<p><strong>World</strong> <a href="/docs">docs</a></p>',
        '<pre><code class="language-ts">const value = 1</code></pre>',
        '<ul><li>One</li><li>Two</li></ul>',
      ].join('')
    )

    expect(markdown).toBe(
      '# Hello\n\n**World** [docs](/docs)\n\n```ts\nconst value = 1\n```\n\n- One\n- Two'
    )
  })

  it('normalizes full-document html before serializing markdown', async () => {
    const markdown = await renderHtmlToMarkdown(
      '<!DOCTYPE html><html><body><h1>Hello</h1><p>World</p></body></html>'
    )

    expect(markdown).toBe('# Hello\n\nWorld')
  })

  it('serializes images, tables, and nested lists', async () => {
    const markdown = await renderHtmlToMarkdown(
      [
        '<img src="/logo.png" alt="Logo" />',
        '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>',
        '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul>',
      ].join('')
    )

    expect(markdown).toBe(
      '![Logo](/logo.png)\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n- One\n  - Nested\n- Two'
    )
  })

  it('drops interactive host nodes by default and allows tag overrides', async () => {
    const Interactive = () => (
      <div>
        <div onClick={() => {}}>Action card</div>
        <button>Ignored</button>
      </div>
    )

    const html = renderToStaticMarkup(
      markReactNode(<Interactive />) as React.ReactElement
    )
    const withoutOverride = await renderHtmlToMarkdown(html)
    const withOverride = await renderHtmlToMarkdown(html, {
      rootComponents: {
        div({ attributes, children, renderDefault }) {
          if (attributes['data-react-markdown-interactive'] === 'true') {
            return `ACTION: ${children || renderDefault()}`
          }
          return renderDefault()
        },
        button({ children }) {
          return `BUTTON: ${children}`
        },
      },
    })

    expect(withoutOverride).toBe('')
    expect(withOverride).toContain('ACTION: Action card')
    expect(withOverride).toContain('BUTTON: Ignored')
  })

  it('prefers component-name overrides over tag overrides', async () => {
    function FancyButton() {
      return <button>Download</button>
    }

    const html = renderToStaticMarkup(
      markReactNode(<FancyButton />) as React.ReactElement
    )

    const markdown = await renderHtmlToMarkdown(html, {
      rootComponents: {
        button() {
          return 'tag override'
        },
        FancyButton() {
          return 'component override'
        },
      },
    })

    expect(markdown).toBe('component override')
  })

  it('supports forwardRef and memo component-name overrides', async () => {
    const FancyAction = React.forwardRef<HTMLButtonElement>(
      function FancyAction(_props, ref) {
        return <button ref={ref}>Save</button>
      }
    )
    const MemoNote = React.memo(function MemoNote() {
      return <p>Memo note</p>
    })

    const html = renderToStaticMarkup(
      markReactNode(
        <>
          <FancyAction />
          <MemoNote />
        </>
      ) as React.ReactElement
    )

    const markdown = await renderHtmlToMarkdown(html, {
      rootComponents: {
        FancyAction() {
          return 'forward-ref override'
        },
        MemoNote() {
          return 'memo override'
        },
      },
    })

    expect(markdown).toBe('forward-ref override\n\nmemo override')
  })

  it('allows overrides to omit output by returning null', async () => {
    const markdown = await renderHtmlToMarkdown(
      '<p>Keep me?</p><img src="/x.png" alt="X" />',
      {
        rootComponents: {
          p() {
            return null
          },
        },
      }
    )

    expect(markdown).toBe('![X](/x.png)')
  })

  it('preserves inline spacing and formatting for paragraph overrides', async () => {
    const markdown = await renderHtmlToMarkdown(
      '<p>Hello <strong>wide</strong> world</p>',
      {
        rootComponents: {
          p({ children }) {
            return `root:${children}`
          },
        },
      }
    )

    expect(markdown).toBe('root:Hello **wide** world')
  })

  it('composes nested segments with child precedence', async () => {
    const segments = new Map<string, MarkdownSegmentDefinition>([
      [
        'layout',
        {
          id: 'layout',
          props: { title: 'Outer' },
          components: {
            p({ children }) {
              return `layout:${children}`
            },
          },
          render(_props, { children }) {
            return `layout-start\n${children}\nlayout-end`
          },
        },
      ],
      [
        'page',
        {
          id: 'page',
          props: { slug: 'hello' },
          components: {
            p({ children }) {
              return `page:${children}`
            },
          },
          render(_props, { content }) {
            return content
          },
        },
      ],
    ])

    const markdown = await renderHtmlToMarkdown(
      [
        '<react-markdown-segment-marker data-segment-id="layout">',
        '<section>',
        '<react-markdown-segment-marker data-segment-id="page">',
        '<p>Hello</p>',
        '</react-markdown-segment-marker>',
        '</section>',
        '</react-markdown-segment-marker>',
      ].join(''),
      {
        rootComponents: {
          p({ children }) {
            return `root:${children}`
          },
        },
        segments,
      }
    )

    expect(markdown).toBe('layout-start\npage:Hello\nlayout-end')
  })

  it('registers segment props while instrumenting components', () => {
    const captured: Array<any> = []

    function Page(props: { title: string }) {
      return <p>{props.title}</p>
    }

    const html = renderToStaticMarkup(
      markReactNode(<Page title="Hello" />, {
        segmentByComponent: new Map([
          [
            Page,
            {
              id: 'page',
              registerProps(props) {
                captured.push(props)
              },
            },
          ],
        ]),
      }) as React.ReactElement
    )

    expect(captured).toEqual([{ title: 'Hello' }])
    expect(html).toContain('data-segment-id="page"')
  })

  it('does not invoke client reference component types while instrumenting', () => {
    const RawClientReference = function ClientReference() {
      throw new Error('should not be called by markReactNode')
    }

    const ClientReference = new Proxy(RawClientReference, {
      get(target, property, receiver) {
        if (property === 'prototype') {
          throw new Error('should not inspect prototype')
        }

        return Reflect.get(target, property, receiver)
      },
    })

    ;(ClientReference as any).$$typeof = Symbol.for('react.client.reference')
    ;(ClientReference as any).$$id = '/app/client-widget.jsx#ClientReference'

    const marked = markReactNode(
      React.createElement(ClientReference as any, { label: 'Hello' })
    ) as React.ReactElement
    const markedChild = (marked.props as { children: React.ReactElement })
      .children

    expect(React.isValidElement(marked)).toBe(true)
    expect(marked.type).toBe('react-markdown-component-marker')
    expect((marked.props as { 'data-name': string })['data-name']).toBe(
      'ClientReference'
    )
    expect(markedChild.type).toBe(ClientReference)
  })
})
