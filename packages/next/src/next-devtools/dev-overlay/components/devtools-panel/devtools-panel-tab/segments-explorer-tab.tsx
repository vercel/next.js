import { PageSegmentTree } from '../../overview/segment-explorer'

function SegmentsExplorer({
  routerType,
}: React.HTMLProps<HTMLDivElement> & {
  routerType: 'app' | 'pages'
}) {
  const isAppRouter = routerType === 'app'
  return <PageSegmentTree isAppRouter={isAppRouter} />
}

export function SegmentsExplorerTab({
  routerType,
}: {
  routerType: 'app' | 'pages'
}) {
  return <SegmentsExplorer routerType={routerType} />
}

export const SEGMENTS_EXPLORER_TAB_STYLES = `
`
