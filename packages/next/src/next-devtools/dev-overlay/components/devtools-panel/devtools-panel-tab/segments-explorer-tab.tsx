const PageSegmentTree = process.env.__NEXT_DEVTOOL_SEGMENT_EXPLORER
  ? (
      require('../../overview/segment-explorer') as typeof import('../../overview/segment-explorer')
    ).PageSegmentTree
  : () => null

function SegmentsExplorer({
  routerType,
  page,
}: React.HTMLProps<HTMLDivElement> & {
  routerType: 'app' | 'pages'
  page: string
}) {
  const isAppRouter = routerType === 'app'
  return <PageSegmentTree isAppRouter={isAppRouter} page={page} />
}

export function SegmentsExplorerTab({
  routerType,
  page,
}: {
  routerType: 'app' | 'pages'
  page: string
}) {
  return <SegmentsExplorer routerType={routerType} page={page} />
}

export const SEGMENTS_EXPLORER_TAB_STYLES = `
`
