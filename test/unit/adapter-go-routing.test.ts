import { prioritizeGoArtifacts } from 'next/dist/build/adapter/go-routing'

type Route = {
  sourceRegex: string
  destination: string
  has?: Array<{ type: string; key: string; value?: string }>
  missing?: Array<{ type: string; key: string; value?: string }>
}

function route(destination: string): Route {
  return { sourceRegex: `matcher:${destination}`, destination }
}

describe('adapter Go artifact ordering', () => {
  it('prioritizes real RSC and segment artifacts without reordering ordinary routes', () => {
    const specificNode = route('/api/specific')
    const nodeRsc = route('/api/[id]/data$2?nxtPid=$nxtPid')
    const ordinaryNode = route('/api/[id]/other')
    const goRsc = route('/api/[id]/data.rsc')
    const goSegment = route('/api/[id]/data.segments/piece.segment.rsc')
    const goCatchAll = route('/api/[...slug]')
    const input = [
      specificNode,
      nodeRsc,
      ordinaryNode,
      goRsc,
      goSegment,
      goCatchAll,
    ]
    const original = [...input]
    const ordered = prioritizeGoArtifacts(
      input,
      new Map([
        [goRsc.destination, goRsc],
        [goSegment.destination, goSegment],
        [goCatchAll.destination, goCatchAll],
      ]),
      new Map([[nodeRsc, '/api/[id]/data']]),
      new Map()
    )

    expect(ordered).toEqual([
      specificNode,
      goRsc,
      goSegment,
      nodeRsc,
      ordinaryNode,
      goRsc,
      goSegment,
      goCatchAll,
    ])
    expect(ordered[1]).not.toBe(goRsc)
    expect(ordered[1].sourceRegex).toBe(goRsc.sourceRegex)
    expect(ordered[2].sourceRegex).toBe(goSegment.sourceRegex)
    expect(input).toEqual(original)
    expect(ordered.at(-1)).toBe(goCatchAll)
  })

  it.each([
    [
      '/api/[id]/data.segments/literal.segment.rsc',
      '/api/[id]/data.segments/literal.segment.rsc',
    ],
    [
      '/api/[id]/data.segments/part$segment',
      '/api/[id]/data.segments/part.segment.rsc',
    ],
    [
      '/api/[id]/data.segments/part$segment',
      '/api/[id]/data.segments/part/__PAGE__.segment.rsc',
    ],
    [
      '/api/$segment/[id]/data.segments/part$segment',
      '/api/$segment/[id]/data.segments/part.segment.rsc',
    ],
  ])(
    'prioritizes a dedicated segment destination %s for %s',
    (target, source) => {
      const segment = route(`${target}?nxtPid=$nxtPid`)
      const goArtifact = route(source)
      const unrelated = route('/api/[id]/unrelated.segment.rsc')
      const ordered = prioritizeGoArtifacts(
        [segment, goArtifact, unrelated],
        new Map([
          [source, goArtifact],
          [unrelated.destination, unrelated],
        ]),
        new Map(),
        new Map([[segment, target]])
      )

      expect(ordered).toEqual([goArtifact, segment, goArtifact, unrelated])
      expect(ordered[0].sourceRegex).toBe(goArtifact.sourceRegex)
      expect(ordered.at(-1)).toBe(unrelated)
    }
  )

  it('retains synthetic conditions on the early artifact and its original unconditional entry', () => {
    const nodeRsc = route('/api/[id]/data$2?nxtPid=$nxtPid')
    nodeRsc.has = [{ type: 'cookie', key: '__prerender_bypass', value: 'test' }]
    nodeRsc.missing = [{ type: 'header', key: 'x-skip-rsc' }]
    const goArtifact = route('/api/[id]/data.rsc')
    const ordered = prioritizeGoArtifacts(
      [nodeRsc, goArtifact],
      new Map([[goArtifact.destination, goArtifact]]),
      new Map([[nodeRsc, '/api/[id]/data']]),
      new Map()
    )

    expect(ordered[0]).toEqual({
      ...goArtifact,
      has: nodeRsc.has,
      missing: nodeRsc.missing,
    })
    expect(ordered[1]).toBe(nodeRsc)
    expect(ordered[2]).toBe(goArtifact)
    expect(goArtifact.has).toBeUndefined()
    expect(goArtifact.missing).toBeUndefined()
  })

  it.each(['[part]', '[...part]', '[[...part]]', 'prefix[part]suffix'])(
    'keeps a Go segment route with extra %s parameters behind more specific Node routes',
    (part) => {
      const nodeRsc = route('/api/[id]/data$2?nxtPid=$nxtPid')
      const specificNode = route(
        '/api/[id]/data.segments/special/literal.segment.rsc'
      )
      const goArtifact = route(
        `/api/[id]/data.segments/${part}/literal.segment.rsc`
      )
      const input = [nodeRsc, specificNode, goArtifact]
      expect(
        prioritizeGoArtifacts(
          input,
          new Map([[goArtifact.destination, goArtifact]]),
          new Map([[nodeRsc, '/api/[id]/data']]),
          new Map()
        )
      ).toEqual(input)
    }
  )

  it('keeps already earlier artifacts in place and leaves tables without Go unchanged', () => {
    const goArtifact = route('/api/[id]/data.rsc')
    const nodeRsc = route('/api/[id]/data$2?nxtPid=$nxtPid')
    const input = [goArtifact, nodeRsc]
    const rscSources = new Map([[nodeRsc, '/api/[id]/data']])
    expect(
      prioritizeGoArtifacts(
        input,
        new Map([[goArtifact.destination, goArtifact]]),
        rscSources,
        new Map()
      )
    ).toEqual(input)
    expect(
      prioritizeGoArtifacts(input, new Map(), rscSources, new Map())
    ).toEqual(input)
  })
})
