import type { ModulesData } from '../../shared/lib/analyze-data'
import type { AnalyzeRepository } from './repository'
import { analyzeQueryTestHelpers, createAnalyzeQueryRegistry } from './queries'

const {
  edgeDominatedModules,
  stronglyConnectedComponents,
  synchronousComponents,
} = analyzeQueryTestHelpers

describe('analyzer query discovery', () => {
  it('documents every query with utility, caveats, schema, and an example', () => {
    const queries = createAnalyzeQueryRegistry({} as AnalyzeRepository).list()
    expect(queries.map((query) => query.name)).toEqual([
      'get_app_overview',
      'get_route_modules',
      'get_source_chunks',
      'get_route_outputs',
      'get_css_assets',
      'explain_route_module',
      'get_initial_import_graph',
      'analyze_import_edge',
      'compare_bundles',
    ])
    for (const query of queries) {
      expect(query.description.length).toBeGreaterThan(20)
      expect(query.caveats.length).toBeGreaterThan(0)
      expect(query.inputSchema).toMatchObject({ type: 'object' })
      expect(query.example).toEqual(expect.any(Object))
      if (query.collection) {
        expect(query.selectableFields?.length).toBeGreaterThan(0)
      }
    }
  })

  it('documents the effective environment default for each query', () => {
    const queries = createAnalyzeQueryRegistry({} as AnalyzeRepository).list()
    for (const [name, defaultEnvironment] of [
      ['get_route_modules', 'total'],
      ['get_initial_import_graph', 'client'],
      ['analyze_import_edge', 'client'],
    ]) {
      const query = queries.find((item) => item.name === name)
      expect(query?.inputSchema).toMatchObject({
        properties: {
          environment: {
            type: 'string',
            enum: ['total', 'client', 'server'],
            description: `Attribution environment. Default: \`${defaultEnvironment}\`.`,
          },
        },
      })
    }
  })
})

describe('analyzer SCC evidence', () => {
  it('uses stable producer SCC IDs when modules.data provides them', () => {
    const modules = {
      hasExactSyncSccs: () => true,
      syncSccId: (index: number) => [7, 7, 11][index],
    } as unknown as ModulesData
    expect(
      synchronousComponents(
        modules,
        [0, 1, 2],
        [
          { from: 0, to: 1 },
          { from: 1, to: 0 },
        ]
      )
    ).toEqual({
      evidence: 'producer-petgraph',
      sccs: [
        { id: 7, members: [0, 1] },
        { id: 11, members: [2] },
      ],
    })
  })

  it('labels query-time SCC calculation for old artifacts', () => {
    const modules = {
      hasExactSyncSccs: () => false,
    } as unknown as ModulesData
    expect(
      synchronousComponents(
        modules,
        [0, 1],
        [
          { from: 0, to: 1 },
          { from: 1, to: 0 },
        ]
      )
    ).toEqual({
      evidence: 'query-fallback',
      sccs: [{ id: 0, members: [0, 1] }],
    })
  })
})

describe('analyzer initial graph facts', () => {
  it('finds edge-exclusive modules without assigning merged diamond nodes', () => {
    const nodes = [0, 1, 2, 3]
    const edges = [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 3 },
    ]

    const dominated = edgeDominatedModules(nodes, edges, new Set([0]))
    expect(dominated.get(0)).toEqual([1])
    expect(dominated.get(1)).toEqual([2])
    expect(dominated.get(2)).toEqual([])
    expect(dominated.get(3)).toEqual([])
  })

  it('handles cycles while retaining edge-specific facts', () => {
    const nodes = [0, 1, 2, 3]
    const edges = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 1 },
      { from: 2, to: 3 },
    ]

    expect(stronglyConnectedComponents(nodes, edges)).toEqual([
      [0],
      [1, 2],
      [3],
    ])
    const dominated = edgeDominatedModules(nodes, edges, new Set([0]))
    expect(dominated.get(0)).toEqual([1, 2, 3])
    expect(dominated.get(1)).toEqual([2, 3])
    expect(dominated.get(2)).toEqual([])
    expect(dominated.get(3)).toEqual([3])
  })

  it('supports multiple route entries', () => {
    const nodes = [0, 1, 2]
    const edges = [
      { from: 0, to: 2 },
      { from: 1, to: 2 },
    ]
    const dominated = edgeDominatedModules(nodes, edges, new Set([0, 1]))
    expect(dominated.get(0)).toEqual([])
    expect(dominated.get(1)).toEqual([])
  })

  it('handles graphs above the former quadratic-set bound', () => {
    const nodes = Array.from({ length: 2000 }, (_, index) => index)
    const edges = nodes.slice(1).map((node) => ({
      from: node - 1,
      to: node,
    }))
    const dominated = edgeDominatedModules(
      nodes,
      edges,
      new Set([0]),
      new Set([0, edges.length - 1])
    )
    expect(dominated.get(0)).toHaveLength(1999)
    expect(dominated.get(edges.length - 1)).toEqual([1999])
  })
})
