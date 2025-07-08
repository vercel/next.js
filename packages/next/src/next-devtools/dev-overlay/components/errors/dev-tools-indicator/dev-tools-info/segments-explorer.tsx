import { PageSegmentTree } from '../../../overview/segment-explorer'
import { DevToolsInfo, type DevToolsInfoPropsCore } from './dev-tools-info'

export function SegmentsExplorer({
  routerType,
  page,
  ...props
}: DevToolsInfoPropsCore &
  React.HTMLProps<HTMLDivElement> & {
    routerType: 'app' | 'pages'
    page: string
  }) {
  const isAppRouter = routerType === 'app'
  return (
    <DevToolsInfo title="Route Info" {...props}>
      <div data-nextjs-segments-explorer>
        <PageSegmentTree isAppRouter={isAppRouter} page={page} />
      </div>
    </DevToolsInfo>
  )
}

export const SEGMENTS_EXPLORER_STYLES = `
  [data-nextjs-segments-explorer] {
    min-width: 768px;
    margin: -16px;
  }

  @media (max-width: 768px) {
    [data-nextjs-segments-explorer] {
      min-width: 90vw;
    }
  }
`
