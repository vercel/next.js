import { AnalyzeData, ModulesData } from './analyze-data'

function edges(rows: number[][]): Uint8Array {
  const edgeCount = rows.reduce((total, row) => total + row.length, 0)
  const result = new Uint8Array(4 + rows.length * 4 + edgeCount * 4)
  const view = new DataView(result.buffer)
  view.setUint32(0, rows.length, false)
  let count = 0
  for (let index = 0; index < rows.length; index++) {
    count += rows[index].length
    view.setUint32(4 + index * 4, count, false)
  }
  let edgeIndex = 0
  for (const row of rows) {
    for (const value of row) {
      view.setUint32(4 + rows.length * 4 + edgeIndex++ * 4, value, false)
    }
  }
  return result
}

function frame(header: object, binary: Uint8Array[]): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(header))
  const length =
    4 + json.byteLength + binary.reduce((sum, part) => sum + part.byteLength, 0)
  const result = new Uint8Array(length)
  new DataView(result.buffer).setUint32(0, json.byteLength, false)
  result.set(json, 4)
  let offset = 4 + json.byteLength
  for (const part of binary) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result.buffer
}

function modulesBuffer(): ArrayBuffer {
  const sections = [
    edges([[1], []]),
    edges([[], [0]]),
    edges([[], []]),
    edges([[], [0]]),
    edges([[1], []]),
    edges([[], []]),
  ]
  let offset = 0
  const references = sections.map((section) => {
    const reference = { offset, length: section.byteLength }
    offset += section.byteLength
    return reference
  })
  return frame(
    {
      modules: [
        { ident: 'first', path: '[project]/src/a.ts' },
        { ident: 'second', path: '[project]/src/a.ts' },
      ],
      module_dependents: references[0],
      async_module_dependents: references[1],
      traced_module_dependents: references[2],
      module_dependencies: references[3],
      async_module_dependencies: references[4],
      traced_module_dependencies: references[5],
    },
    sections
  )
}

function analyzeBuffer(exact = true): ArrayBuffer {
  const sections = [edges([[0], []]), edges([[], [0]]), edges([[1], []])]
  let offset = 0
  const references = sections.map((section) => {
    const reference = { offset, length: section.byteLength }
    offset += section.byteLength
    return reference
  })
  return frame(
    {
      sources: [
        { parent_source_index: null, path: '[project]/src/' },
        { parent_source_index: 0, path: 'a.ts' },
      ],
      chunk_parts: [
        {
          source_index: 1,
          output_file_index: 0,
          size: 100,
          compressed_size: 40,
        },
      ],
      output_files: [
        { filename: '[client-fs]/app.js' },
        { filename: '[client-fs]/font.woff2' },
      ],
      ...(exact
        ? {
            route_entries: [
              {
                route_entry_id: 'route|client|first',
                module_ident: 'first',
                module_path: '[project]/src/a.ts',
                role: 'route',
                runtime: 'client',
              },
            ],
          }
        : {}),
      output_file_chunk_parts: references[0],
      source_chunk_parts: references[1],
      source_children: references[2],
      source_roots: [0],
    },
    sections
  )
}

describe('analyzer data parser', () => {
  it('reconstructs source paths, sizes, flags, chunks, and graph edges', () => {
    const analyze = new AnalyzeData(analyzeBuffer())
    expect(analyze.getFullSourcePath(1)).toBe('[project]/src/a.ts')
    expect(analyze.getSourceIndexFromPath('[project]/src/a.ts')).toBe(1)
    expect(analyze.getOwnSizes(1)).toEqual({ size: 100, compressedSize: 40 })
    expect(analyze.getSourceFlags(1).client).toBe(true)
    expect(analyze.sourceChunks(1)).toEqual(['[client-fs]/app.js'])
    expect(analyze.sourceChildren(0)).toEqual([1])
    expect(analyze.hasExactRouteEntries()).toBe(true)
    expect(analyze.routeEntries()).toEqual([
      expect.objectContaining({ route_entry_id: 'route|client|first' }),
    ])
    const modules = new ModulesData(modulesBuffer())
    expect(
      modules.getModuleIndiciesFromPath('[project]/src/a.ts')
    ).toHaveLength(2)
    expect(modules.moduleDependents(0)).toEqual([1])
    expect(modules.asyncModuleDependents(1)).toEqual([0])
    expect(modules.moduleDependencies(1)).toEqual([0])
    expect(modules.getModuleIndexFromIdent('second')).toBe(1)
  })

  it('keeps old artifacts readable with explicit unavailable evidence', () => {
    const analyze = new AnalyzeData(analyzeBuffer(false))
    expect(analyze.hasExactRouteEntries()).toBe(false)
    expect(analyze.routeEntries()).toEqual([])
  })

  it('rejects duplicate exact route entry IDs', () => {
    const valid = new Uint8Array(analyzeBuffer())
    const jsonLength = new DataView(valid.buffer).getUint32(0, false)
    const header = JSON.parse(
      new TextDecoder().decode(valid.slice(4, 4 + jsonLength))
    )
    header.route_entries.push({ ...header.route_entries[0] })
    const binary = valid.slice(4 + jsonLength)
    expect(() => new AnalyzeData(frame(header, [binary]))).toThrow(
      'Invalid analyze.data route entry'
    )
  })

  it('rejects truncated and malformed framing', () => {
    expect(() => new AnalyzeData(new ArrayBuffer(3))).toThrow(
      'truncated header'
    )
    const truncated = new Uint8Array(8)
    new DataView(truncated.buffer).setUint32(0, 20, false)
    expect(() => new AnalyzeData(truncated.buffer)).toThrow('truncated JSON')
    expect(() => new AnalyzeData(frame({}, []))).toThrow('analyze.data sources')
  })

  it('rejects source child cycles', () => {
    const section = edges([[1], [0]])
    const cyclic = frame(
      {
        sources: [
          { parent_source_index: null, path: 'a' },
          { parent_source_index: 0, path: 'b' },
        ],
        chunk_parts: [],
        output_files: [],
        output_file_chunk_parts: { offset: 0, length: edges([]).byteLength },
        source_chunk_parts: {
          offset: edges([]).byteLength,
          length: edges([[], []]).byteLength,
        },
        source_children: {
          offset: edges([]).byteLength + edges([[], []]).byteLength,
          length: section.byteLength,
        },
        source_roots: [0],
      },
      [edges([]), edges([[], []]), section]
    )
    expect(() => new AnalyzeData(cyclic)).toThrow('source children')
  })

  it('rejects malformed adjacency sections', () => {
    const valid = new Uint8Array(modulesBuffer())
    const jsonLength = new DataView(valid.buffer).getUint32(0, false)
    const binaryOffset = 4 + jsonLength
    new DataView(valid.buffer).setUint32(binaryOffset + 4, 99, false)
    expect(() => new ModulesData(valid.buffer)).toThrow(
      'Invalid modules.data module_dependents'
    )
  })
})
