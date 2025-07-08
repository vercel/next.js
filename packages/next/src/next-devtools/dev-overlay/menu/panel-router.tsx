import { useState } from 'react'
import { usePanelContext } from './context'
import { DevtoolMenu } from './dev-overlay-menu'
import { DevOverlayPanel } from '../panel/panel'
import { SettingsTab } from '../components/devtools-panel/devtools-panel-tab/settings-tab'
import { RouteInfo } from '../components/errors/dev-tools-indicator/dev-tools-info/route-info'
import { SegmentsExplorerTab } from '../components/devtools-panel/devtools-panel-tab/segments-explorer-tab'
import { PageSegmentTree } from '../components/overview/segment-explorer'
import { TurbopackInfo } from '../components/errors/dev-tools-indicator/dev-tools-info/turbopack-info'

export const PanelRouter = () => {
  const { panel } = usePanelContext()
  // const [isMenuOpen, setIsMenuOpen] = useState(false)

  switch (panel) {
    case 'panel-selector': {
      // will need to probably pass/share more later
      return <DevtoolMenu />
    }
    case 'preferences': {
      return (
        <DevOverlayPanel header={<>Preferences header TBD</>}>
          <SettingsTab />
        </DevOverlayPanel>
      )
    }
    case 'route-info': {
      return (
        <DevOverlayPanel header={<>Route info header TBD</>}>
          <RouteInfo />
        </DevOverlayPanel>
      )
    }
    case 'segment-explorer': {
      return (
        <DevOverlayPanel header={<>Segment explorer header tbd</>}>
          <PageSegmentTree />
        </DevOverlayPanel>
      )
    }
    case 'turbo-info': {
      return (
        <DevOverlayPanel header={<></>}>
          <TurbopackInfo
            // tbd need to see how close/trigger ref is being used, can probably context those since it shows up everywhere
            close={() => {}}
            triggerRef={{ current: null! }}
            isOpen={true}
          />
        </DevOverlayPanel>
      )
    }
    // need a few more cases
    default: {
      return
    }
  }
}
