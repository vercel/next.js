import { assertNoErrorSpansInSuccessfulTraces } from '../e2e/opentelemetry/instrumentation/span-invariants'
import type { SavedSpan } from '../e2e/opentelemetry/instrumentation/constants'

const ERROR = { code: 2 }
const OK = { code: 1 }

function rootSpan(
  traceId: string,
  statusCode: unknown,
  extra: Partial<SavedSpan> = {}
): SavedSpan {
  return {
    traceId,
    id: `${traceId}-root`,
    name: 'GET /',
    attributes: {
      'next.span_type': 'BaseServer.handleRequest',
      'http.status_code': statusCode,
      'http.target': '/',
    },
    status: { code: 0 },
    ...extra,
  }
}

function childSpan(
  traceId: string,
  name: string,
  status: any,
  parentId = `${traceId}-root`
): SavedSpan {
  return { traceId, id: `${traceId}-${name}`, parentId, name, status }
}

describe('assertNoErrorSpansInSuccessfulTraces', () => {
  it('passes when there are no spans', () => {
    expect(() => assertNoErrorSpansInSuccessfulTraces([])).not.toThrow()
  })

  it('passes for a successful trace without error spans', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 200),
        childSpan('t1', 'render', OK),
        childSpan('t1', 'fetch', undefined),
      ])
    ).not.toThrow()
  })

  it('fails when a successful trace contains an error child span', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 200),
        childSpan('t1', 'render', ERROR),
      ])
    ).toThrow(/render/)
  })

  it('fails when the root span of a successful trace has an error status', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 302, { status: ERROR }),
      ])
    ).toThrow()
  })

  it('treats status codes just below 400 as successful', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 399),
        childSpan('t1', 'render', ERROR),
      ])
    ).toThrow()
  })

  it.each([400, 404, 500])(
    'skips traces whose root has status code %s',
    (statusCode) => {
      expect(() =>
        assertNoErrorSpansInSuccessfulTraces([
          rootSpan('t1', statusCode),
          childSpan('t1', 'render', ERROR),
        ])
      ).not.toThrow()
    }
  )

  it('skips traces whose root status code is not a number', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', '200'),
        childSpan('t1', 'render', ERROR),
      ])
    ).not.toThrow()
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t2', undefined),
        childSpan('t2', 'render', ERROR),
      ])
    ).not.toThrow()
  })

  it('skips traces without a collected root request span', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        childSpan('t1', 'render', ERROR, 'missing-parent'),
      ])
    ).not.toThrow()
  })

  it('does not treat a nested handleRequest span as a root', () => {
    const nested: SavedSpan = {
      ...rootSpan('t1', 500),
      id: 't1-nested',
      parentId: 't1-root',
    }
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 200),
        nested,
        childSpan('t1', 'render', ERROR),
      ])
    ).toThrow()
  })

  it('treats a handleRequest span whose parent was not collected as a root', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 200, { parentId: 'external-parent' }),
        childSpan('t1', 'render', ERROR),
      ])
    ).toThrow()
  })

  it('skips a trace when any of its root spans failed', () => {
    const secondRoot: SavedSpan = {
      ...rootSpan('t1', 500),
      id: 't1-root-2',
    }
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 200),
        secondRoot,
        childSpan('t1', 'render', ERROR),
      ])
    ).not.toThrow()
  })

  it('ignores spans without a traceId', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('t1', 200),
        { id: 'orphan', name: 'orphan', status: ERROR },
      ])
    ).not.toThrow()
  })

  it('groups spans by trace so errors in failed traces do not leak', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('ok', 200),
        childSpan('ok', 'render', OK),
        rootSpan('bad', 500),
        childSpan('bad', 'render', ERROR),
      ])
    ).not.toThrow()
  })

  it('reports only the error spans of successful traces', () => {
    let error: any
    try {
      assertNoErrorSpansInSuccessfulTraces([
        rootSpan('ok', 200),
        childSpan('ok', 'okRender', ERROR),
        rootSpan('bad', 500),
        childSpan('bad', 'badRender', ERROR),
      ])
    } catch (err) {
      error = err
    }
    expect(error).toBeDefined()
    expect(error.message).toContain('okRender')
    expect(error.message).not.toContain('badRender')
  })

  it('skips traces whose root matches the ignore predicate', () => {
    const ignore = jest.fn(
      (root: SavedSpan) => root.attributes?.['http.target'] === '/error'
    )
    const ignoredRoot = rootSpan('t1', 200)
    ignoredRoot.attributes!['http.target'] = '/error'

    expect(() =>
      assertNoErrorSpansInSuccessfulTraces(
        [ignoredRoot, childSpan('t1', 'render', ERROR)],
        { ignore }
      )
    ).not.toThrow()
    expect(ignore).toHaveBeenCalledWith(ignoredRoot)
  })

  it('still fails for traces not matched by the ignore predicate', () => {
    expect(() =>
      assertNoErrorSpansInSuccessfulTraces(
        [rootSpan('t1', 200), childSpan('t1', 'render', ERROR)],
        { ignore: (root) => root.attributes?.['http.target'] === '/error' }
      )
    ).toThrow()
  })
})
