import type { AnalyzeQueryError } from '../build/analyze/query'
import { collectAllQueryPages, projectQueryFields } from './next-analyze-query'

function pager(total: number, pageSize = 2000) {
  return async (offset: number) => {
    const returned = Math.max(0, Math.min(pageSize, total - offset))
    return {
      rows: Array.from({ length: returned }, (_, index) => ({
        key: offset + index,
        value: `row-${offset + index}`,
      })),
      totals: { rowCount: total },
      caveats: ['evidence'],
      pagination: {
        offset,
        limit: pageSize,
        total,
        returned,
        truncated: offset + returned < total,
      },
    }
  }
}

describe('analyzer query CLI result handling', () => {
  it('collects all pages without gaps or duplicates', async () => {
    const result = (await collectAllQueryPages('rows', pager(2001))) as {
      rows: Array<{ key: number }>
      totals: { rowCount: number }
      caveats: string[]
      pagination: { total: number; truncated: boolean }
    }
    expect(result.rows).toHaveLength(2001)
    expect(result.rows.map((row) => row.key)).toEqual(
      Array.from({ length: 2001 }, (_, index) => index)
    )
    expect(result.totals).toEqual({ rowCount: 2001 })
    expect(result.caveats).toEqual(['evidence'])
    expect(result.pagination).toMatchObject({ total: 2001, truncated: false })
  })

  it('fails before returning a result above the all-results cap', async () => {
    await expect(collectAllQueryPages('rows', pager(10_001))).rejects.toEqual(
      expect.objectContaining<Partial<AnalyzeQueryError>>({
        output: expect.objectContaining({
          total: 10_001,
          maxAllResults: 10_000,
        }),
      })
    )
  })

  it('rejects pagination that makes no progress', async () => {
    await expect(
      collectAllQueryPages('rows', async (offset) => ({
        rows: [],
        pagination: {
          offset,
          limit: 2000,
          total: 2,
          returned: 0,
          truncated: true,
        },
      }))
    ).rejects.toMatchObject({
      output: { error: 'Pagination made no progress' },
    })
  })

  it('projects row fields while preserving top-level facts', () => {
    expect(
      projectQueryFields(
        {
          rows: [{ key: 'a', rawSize: 10, loadScopes: ['initial'] }],
          totals: { rawSize: 10 },
          caveats: ['estimated'],
        },
        'rows',
        ['key', 'loadScopes']
      )
    ).toEqual({
      rows: [{ key: 'a', loadScopes: ['initial'] }],
      totals: { rawSize: 10 },
      caveats: ['estimated'],
    })
  })
})
