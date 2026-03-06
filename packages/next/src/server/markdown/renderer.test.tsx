/* eslint-disable @next/internal/no-ambiguous-jsx -- Test fixtures use concise JSX trees to exercise React-to-Markdown instrumentation. */
import React from 'react'

import {
  MARKDOWN_SEGMENT_MARKER_TAG,
  markReactNode,
  renderReactToMarkdown,
  type MarkdownSegmentDefinition,
} from '../../../../next-markdown/src'

describe('markdown renderer', () => {
  it('serializes basic markdown blocks', async () => {
    const markdown = await renderReactToMarkdown(
      <>
        <h1>Hello</h1>
        <p>
          <strong>World</strong> <a href="/docs">docs</a>
        </p>
        <pre>
          <code className="language-ts">const value = 1</code>
        </pre>
        <ul>
          <li>One</li>
          <li>Two</li>
        </ul>
      </>
    )

    expect(markdown).toBe(
      '# Hello\n\n**World** [docs](/docs)\n\n```ts\nconst value = 1\n```\n\n- One\n- Two'
    )
  })

  it('emits dangerouslySetInnerHTML as raw html', async () => {
    const markdown = await renderReactToMarkdown(
      <div
        dangerouslySetInnerHTML={{
          __html: '<h1>Hello</h1>\n<p>World</p>',
        }}
      />
    )

    expect(markdown).toBe('<h1>Hello</h1>\n<p>World</p>')
  })

  it('serializes images, tables, and nested lists', async () => {
    const markdown = await renderReactToMarkdown(
      <>
        <img src="/logo.png" alt="Logo" />
        <table>
          <tbody>
            <tr>
              <th>Name</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>A</td>
              <td>1</td>
            </tr>
          </tbody>
        </table>
        <ul>
          <li>
            One
            <ul>
              <li>Nested</li>
            </ul>
          </li>
          <li>Two</li>
        </ul>
      </>
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

    const marked = markReactNode(<Interactive />) as React.ReactElement
    const withoutOverride = await renderReactToMarkdown(marked)
    const withOverride = await renderReactToMarkdown(marked, {
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

    const markdown = await renderReactToMarkdown(
      markReactNode(<FancyButton />),
      {
        rootComponents: {
          button() {
            return 'tag override'
          },
          FancyButton() {
            return 'component override'
          },
        },
      }
    )

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

    const markdown = await renderReactToMarkdown(
      markReactNode(
        <>
          <FancyAction />
          <MemoNote />
        </>
      ),
      {
        rootComponents: {
          FancyAction() {
            return 'forward-ref override'
          },
          MemoNote() {
            return 'memo override'
          },
        },
      }
    )

    expect(markdown).toBe('forward-ref override\n\nmemo override')
  })

  it('allows overrides to omit output by returning null', async () => {
    const markdown = await renderReactToMarkdown(
      <>
        <p>Keep me?</p>
        <img src="/x.png" alt="X" />
      </>,
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
    const markdown = await renderReactToMarkdown(
      <p>
        Hello <strong>wide</strong> world
      </p>,
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

    const markdown = await renderReactToMarkdown(
      React.createElement(
        MARKDOWN_SEGMENT_MARKER_TAG,
        { 'data-segment-id': 'layout' },
        <section>
          {React.createElement(
            MARKDOWN_SEGMENT_MARKER_TAG,
            { 'data-segment-id': 'page' },
            <p>Hello</p>
          )}
        </section>
      ),
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

  it('registers segment props while instrumenting components', async () => {
    const captured: Array<any> = []

    function Page(props: { title: string }) {
      return <p>{props.title}</p>
    }

    const markdown = await renderReactToMarkdown(
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
    expect(markdown).toBe('Hello')
  })

  it('strips internal segment explorer wrappers from markdown instrumentation', async () => {
    const SegmentViewNode = function SegmentViewNode() {
      throw new Error('should not be rendered')
    }
    const SegmentViewStateNode = function SegmentViewStateNode() {
      throw new Error('should not be rendered')
    }

    ;(SegmentViewNode as any).$$typeof = Symbol.for('react.client.reference')
    ;(SegmentViewNode as any).$$id =
      '/next-devtools/userspace/app/segment-explorer-node#SegmentViewNode'
    ;(SegmentViewStateNode as any).$$typeof = Symbol.for(
      'react.client.reference'
    )
    ;(SegmentViewStateNode as any).$$id =
      '/next-devtools/userspace/app/segment-explorer-node#SegmentViewStateNode'

    const markdown = await renderReactToMarkdown(
      markReactNode(
        <>
          {React.createElement(
            SegmentViewNode as any,
            null,
            <p>Hello from app route</p>
          )}
          {React.createElement(SegmentViewStateNode as any)}
        </>
      )
    )

    expect(markdown).toBe('Hello from app route')
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
