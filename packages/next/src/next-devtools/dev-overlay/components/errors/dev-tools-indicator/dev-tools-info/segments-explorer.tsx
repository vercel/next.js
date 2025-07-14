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
      <div data-nextjs-segments-explorer style={{ margin: '-16px' }}>
        <PageSegmentTree isAppRouter={isAppRouter} page={page} />
      </div>
    </DevToolsInfo>
  )
}
