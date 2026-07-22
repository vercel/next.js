import type {
  RequestInsight,
  RequestInsightOperation,
} from '../../../shared/request-insights'
import { getActiveRequestId, isPageLoadRequest } from './request-list'
import { getTraceItems, getTracePosition, getTraceRange } from './trace-viewer'

function createRequest(
  overrides: Partial<RequestInsight> = {}
): RequestInsight {
  return {
    requestId: 'request-1',
    htmlRequestId: 'html-1',
    startTime: 100,
    durationMs: 100,
    status: 'ok',
    operations: [],
    fetches: [],
    ...overrides,
  }
}

function createOperation(
  overrides: Partial<RequestInsightOperation> &
    Pick<RequestInsightOperation, 'id' | 'name' | 'startTime'>
): RequestInsightOperation {
  return {
    type: overrides.name,
    category: 'nextjs',
    durationMs: 10,
    status: 'ok',
    ...overrides,
  }
}

describe('request insights trace viewer', () => {
  it('keeps the active request selected when newer requests arrive', () => {
    const selectedRequest = createRequest({ requestId: 'selected' })
    const newerRequest = createRequest({ requestId: 'newer' })

    expect(getActiveRequestId([selectedRequest], null)).toBe('selected')
    expect(
      getActiveRequestId([newerRequest, selectedRequest], 'selected')
    ).toBe('selected')
    expect(getActiveRequestId([newerRequest], 'selected')).toBe('newer')
  })

  it('only marks the exact initial document request as the page load', () => {
    const initialRequestId = 'document-request'

    expect(
      isPageLoadRequest(
        createRequest({
          requestId: initialRequestId,
          htmlRequestId: initialRequestId,
        }),
        initialRequestId
      )
    ).toBe(true)
    expect(
      isPageLoadRequest(
        createRequest({
          requestId: 'related-rsc-request',
          htmlRequestId: initialRequestId,
        }),
        initialRequestId
      )
    ).toBe(false)
  })

  it('orders operations by their recorded parent-child hierarchy', () => {
    const request = createRequest({
      operations: [
        createOperation({
          id: 3,
          name: 'second child',
          parentId: 0,
          startTime: 150,
          durationMs: 20,
        }),
        createOperation({
          id: 2,
          name: 'grandchild',
          parentId: 1,
          startTime: 115,
          durationMs: 5,
        }),
        createOperation({
          id: 0,
          name: 'root',
          startTime: 100,
          durationMs: 100,
        }),
        createOperation({
          id: 1,
          name: 'first child',
          parentId: 0,
          startTime: 110,
          durationMs: 30,
        }),
      ],
    })

    expect(
      getTraceItems(request, true).map(({ label, depth }) => ({
        label,
        depth,
      }))
    ).toEqual([
      { label: 'root', depth: 0 },
      { label: 'first child', depth: 1 },
      { label: 'grandchild', depth: 2 },
      { label: 'second child', depth: 1 },
    ])
  })

  it('filters collected operations for presentation without changing collection', () => {
    const request = createRequest({
      operations: [
        createOperation({
          id: 1,
          name: 'GET',
          type: 'BaseServer.handleRequest',
          startTime: 100,
          durationMs: 100,
        }),
        createOperation({
          id: 2,
          name: 'prepare request',
          type: 'BaseServer.prepareRequest',
          parentId: 1,
          startTime: 101,
          durationMs: 5,
        }),
        createOperation({
          id: 3,
          name: 'match route',
          type: 'NextNodeServer.matchRoute',
          parentId: 2,
          startTime: 106,
          durationMs: 5,
        }),
        createOperation({
          id: 4,
          name: 'compile and prepare route',
          type: 'DevRouteMatcherManager.ensureRoute',
          parentId: 3,
          startTime: 107,
          durationMs: 2,
        }),
        createOperation({
          id: 5,
          name: 'compile route',
          type: 'DevBundlerService.ensurePage',
          parentId: 4,
          startTime: 107.1,
          durationMs: 1.5,
        }),
        createOperation({
          id: 6,
          name: 'render',
          type: 'BaseServer.render',
          parentId: 3,
          startTime: 110,
          durationMs: 85,
        }),
        createOperation({
          id: 7,
          name: 'resolve page components',
          type: 'NextNodeServer.findPageComponents',
          parentId: 6,
          startTime: 110.1,
          durationMs: 2,
        }),
        createOperation({
          id: 8,
          name: 'LoadComponents.loadComponents',
          type: 'LoadComponents.loadComponents',
          parentId: 7,
          startTime: 110.2,
          durationMs: 1,
        }),
        createOperation({
          id: 9,
          name: 'prepare app page response',
          type: 'AppRender.prepareAppPageResponse',
          parentId: 6,
          startTime: 111,
          durationMs: 1,
        }),
        createOperation({
          id: 10,
          name: 'initialize app render',
          type: 'AppRender.initializeRender',
          parentId: 6,
          startTime: 112,
          durationMs: 1,
        }),
        createOperation({
          id: 11,
          name: 'render route (app) /',
          type: 'AppRender.getBodyResult',
          parentId: 6,
          startTime: 113,
          durationMs: 80,
        }),
        createOperation({
          id: 12,
          name: 'render RSC response',
          type: 'AppRender.renderRSCResponse',
          parentId: 11,
          startTime: 113.5,
          durationMs: 75,
        }),
        createOperation({
          id: 13,
          name: 'wait for RSC render task',
          type: 'AppRender.waitForRSC',
          parentId: 11,
          startTime: 114,
          durationMs: 5,
        }),
        createOperation({
          id: 14,
          name: 'render HTML shell',
          type: 'AppRender.renderToNodeFizzStream',
          parentId: 11,
          startTime: 120,
          durationMs: 5,
        }),
        createOperation({
          id: 15,
          name: 'wait for HTML completion',
          type: 'AppRender.waitForHTMLCompletion',
          parentId: 11,
          startTime: 125,
          durationMs: 65,
        }),
      ],
    })

    expect(
      getTraceItems(request, false).map(({ label, depth }) => ({
        label,
        depth,
      }))
    ).toEqual([
      { label: 'GET', depth: 0 },
      { label: 'match route', depth: 1 },
      { label: 'compile and prepare route', depth: 2 },
      { label: 'render', depth: 2 },
      { label: 'load components', depth: 3 },
      { label: 'prepare app page response', depth: 3 },
      { label: 'initialize app render', depth: 3 },
      { label: 'render route (app) /', depth: 3 },
      { label: 'render RSC response', depth: 4 },
      { label: 'wait for RSC render task', depth: 4 },
      { label: 'render HTML shell', depth: 4 },
      { label: 'wait for HTML completion', depth: 4 },
    ])
    expect(getTraceItems(request, true).map((item) => item.label)).toEqual([
      'GET',
      'prepare request',
      'match route',
      'compile and prepare route',
      'compile route',
      'render',
      'resolve page components',
      'load components',
      'prepare app page response',
      'initialize app render',
      'render route (app) /',
      'render RSC response',
      'wait for RSC render task',
      'render HTML shell',
      'wait for HTML completion',
    ])
  })

  it('gives every displayed operation a human readable name', () => {
    const request = createRequest({
      operations: [
        createOperation({
          id: 1,
          name: 'AppRender.renderToNodeFizzStream',
          type: 'AppRender.renderToNodeFizzStream',
          startTime: 100,
        }),
        createOperation({
          id: 2,
          name: 'wait for Fizz render task',
          type: 'AppRender.waitForFizzRenderTask',
          startTime: 110,
        }),
        createOperation({
          id: 3,
          name: 'AppRender.renderToNodeFlightStream',
          type: 'AppRender.renderToNodeFlightStream',
          startTime: 120,
        }),
        createOperation({
          id: 4,
          name: 'render HTML stream',
          type: 'AppRender.renderToReadableStream',
          startTime: 130,
        }),
      ],
    })
    const expectedLabels = [
      'render to HTML stream',
      'wait for HTML render task',
      'render to RSC stream',
      'render HTML stream',
    ]

    expect(getTraceItems(request, true).map((item) => item.label)).toEqual(
      expectedLabels
    )
  })

  it('uses the typed Next.js and Application categories', () => {
    const request = createRequest({
      operations: [
        createOperation({
          id: 1,
          name: 'render',
          type: 'BaseServer.render',
          category: 'nextjs',
          startTime: 100,
        }),
        createOperation({
          id: 2,
          name: 'generateMetadata /',
          type: 'ResolveMetadata.generateMetadata',
          category: 'application',
          startTime: 110,
        }),
        createOperation({
          id: 3,
          name: 'custom database operation',
          type: 'database.query',
          category: 'application',
          startTime: 120,
        }),
      ],
    })

    expect(
      getTraceItems(request, false).map(({ label, category }) => ({
        label,
        category,
      }))
    ).toEqual([
      { label: 'render', category: 'nextjs' },
      { label: 'generate metadata /', category: 'application' },
      { label: 'custom database operation', category: 'application' },
    ])
  })

  it('uses fetch records directly and nests them under their parent operation', () => {
    const request = createRequest({
      operations: [
        createOperation({
          id: 1,
          name: 'root',
          type: 'BaseServer.handleRequest',
          startTime: 100,
          durationMs: 100,
        }),
      ],
      fetches: [
        {
          id: 1,
          parentOperationId: 1,
          method: 'GET',
          url: 'https://example.com/api',
          startTime: 120,
          durationMs: 25,
          cacheStatus: 'miss',
        },
        {
          id: 2,
          parentOperationId: 1,
          method: 'GET',
          url: 'https://example.com/internal',
          statusCode: 500,
          startTime: 155,
          durationMs: 10,
          cacheStatus: 'miss',
        },
      ],
    })

    expect(getTraceItems(request, false)).toEqual([
      expect.objectContaining({
        label: 'root',
        depth: 0,
        kind: 'operation',
        operationId: 1,
      }),
      expect.objectContaining({
        id: 'fetch:1',
        label: 'GET /api',
        depth: 1,
        kind: 'fetch',
        parentOperationId: 1,
        durationMs: 25,
        category: 'application',
        status: 'ok',
      }),
      expect.objectContaining({
        id: 'fetch:2',
        label: 'GET /internal',
        depth: 1,
        kind: 'fetch',
        parentOperationId: 1,
        durationMs: 10,
        category: 'application',
        status: 'error',
      }),
    ])
  })

  it('uses the request time range and clips outlier operations', () => {
    const request = createRequest({
      startTime: 100,
      durationMs: 50,
      operations: [
        createOperation({
          id: 1,
          name: 'early operation',
          type: 'BaseServer.handleRequest',
          startTime: 90,
          durationMs: 20,
        }),
        createOperation({
          id: 2,
          name: 'late operation',
          type: 'BaseServer.handleRequest',
          startTime: 140,
          durationMs: 30,
        }),
      ],
    })
    const items = getTraceItems(request, false)
    const range = getTraceRange(request)

    expect(range).toEqual({ startTime: 100, durationMs: 50 })
    expect(getTracePosition(items[0], range)).toEqual({
      left: 0,
      width: 20,
      offsetMs: 0,
    })
    expect(getTracePosition(items[1], range)).toEqual({
      left: 80,
      width: 20,
      offsetMs: 40,
    })
  })
})
