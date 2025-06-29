import { PageSegmentTree } from '../../../overview/segment-explorer'
import { DevToolsInfo, type DevToolsInfoPropsCore } from './dev-tools-info'

export function SegmentsExplorer({
  routerType,
  ...props
}: DevToolsInfoPropsCore &
  React.HTMLProps<HTMLDivElement> & {
    routerType: 'app' | 'pages'
  }) {
  const isAppRouter = routerType === 'app'
  return (
    <DevToolsInfo title="Route Info" {...props}>
      <div data-nextjs-segments-explorer>
        <PageSegmentTree isAppRouter={isAppRouter} />
      </div>
    </DevToolsInfo>
  )
}

export const SEGMENTS_EXPLORER_STYLES = `
  [data-nextjs-segments-explorer] {
    margin: -12px -8px;
  }
`
