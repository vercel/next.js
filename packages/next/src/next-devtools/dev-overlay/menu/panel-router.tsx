import { usePanelRouterContext, type PanelStateKind } from './context'
import { ChevronRight, DevtoolMenu, IssueCount } from './dev-overlay-menu'
import { DynamicPanel } from '../panel/dynamic-panel'
import { RouteInfoBody } from '../components/errors/dev-tools-indicator/dev-tools-info/route-info'
import { PageSegmentTree } from '../components/overview/segment-explorer'
import { TurbopackInfoBody } from '../components/errors/dev-tools-indicator/dev-tools-info/turbopack-info'
import { DevToolsHeader } from '../components/errors/dev-tools-indicator/dev-tools-info/dev-tools-header'
import { useDelayedRender } from '../hooks/use-delayed-render'
import {
  getShadowRoot,
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../components/errors/dev-tools-indicator/utils'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { createContext, useContext, useEffect } from 'react'
import { useRenderErrorContext } from '../dev-overlay'
import {
  ACTION_DEV_INDICATOR_SET,
  ACTION_DEVTOOLS_POSITION,
  ACTION_DEVTOOLS_SCALE,
  ACTION_ERROR_OVERLAY_OPEN,
} from '../shared'
import GearIcon from '../icons/gear-icon'
import { UserPreferencesBody } from '../components/errors/dev-tools-indicator/dev-tools-info/user-preferences'
import { useHideShortcutStorage } from '../components/errors/dev-tools-indicator/dev-tools-info/preferences'
import { useShortcuts } from '../hooks/use-shortcuts'

const MenuPanel = () => {
  const { setPanel } = usePanelRouterContext()
  const { state, dispatch } = useDevOverlayContext()
  const { totalErrorCount } = useRenderErrorContext()
  return (
    <DevtoolMenu
      items={[
        totalErrorCount > 0 && {
          title: `${totalErrorCount} ${totalErrorCount === 1 ? 'issue' : 'issues'} found. Click to view details in the dev overlay.`,
          label: 'Issues',
          value: <IssueCount>{totalErrorCount}</IssueCount>,
          onClick: () => {
            setPanel(null)
            if (totalErrorCount > 0) {
              dispatch({
                type: ACTION_ERROR_OVERLAY_OPEN,
              })
            }
          },
        },
        {
          title: `Current route is ${state.staticIndicator ? 'static' : 'dynamic'}.`,
          label: 'Route',
          value: state.staticIndicator ? 'Static' : 'Dynamic',
          onClick: () => setPanel('route-type'),
          attributes: {
            'data-nextjs-route-type': state.staticIndicator
              ? 'static'
              : 'dynamic',
          },
        },
        !!process.env.TURBOPACK
          ? {
              title: 'Turbopack is enabled.',
              label: 'Turbopack',
              value: 'Enabled',
            }
          : {
              title:
                'Learn about Turbopack and how to enable it in your application.',
              label: 'Try Turbopack',
              value: <ChevronRight />,
              onClick: () => setPanel('turbo-info'),
            },
        !!process.env.__NEXT_DEVTOOL_SEGMENT_EXPLORER && {
          label: 'Route Info',
          value: <ChevronRight />,
          onClick: () => setPanel('segment-explorer'),
          attributes: {
            'data-segment-explorer': true,
          },
        },
        {
          label: 'Preferences',
          value: <GearIcon />,
          onClick: () => setPanel('preferences'),
          footer: true,
          attributes: {
            'data-preferences': true,
          },
        },
      ]}
    />
  )
}

const useGoBackOnEscape = () => {
  const { setPanel } = usePanelRouterContext()
  const { panel } = usePanelRouterContext()
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.activeElement === document.body) {
        if (panel === 'panel-selector') {
          setPanel(null)
        } else {
          setPanel('panel-selector')
        }
      }
    }
    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [setPanel, panel])
}
// a little hacky but it does the trick
const useToggleDevtoolsVisibility = () => {
  const { state, dispatch } = useDevOverlayContext()
  return () => {
    console.log('hiding shortcut')
    dispatch({
      type: ACTION_DEV_INDICATOR_SET,
      disabled: !state.disableDevIndicator,
    })
    const portal = getShadowRoot()
    if (portal) {
      const menuElement = portal.getElementById('panel-route') as HTMLElement
      const indicatorElement = portal.getElementById(
        'data-devtools-indicator'
      ) as HTMLElement

      if (menuElement && menuElement.firstElementChild) {
        const firstChild = menuElement.firstElementChild as HTMLElement
        const isCurrentlyHidden = firstChild.style.display === 'none'
        firstChild.style.display = isCurrentlyHidden ? '' : 'none'
      }

      if (indicatorElement) {
        const isCurrentlyHidden = indicatorElement.style.display === 'none'
        indicatorElement.style.display = isCurrentlyHidden ? '' : 'none'
      }
    }
  }
}

export const PanelRouter = () => {
  const { state } = useDevOverlayContext()
  const { triggerRef } = usePanelRouterContext()
  const toggleDevtools = useToggleDevtoolsVisibility

  const [hideShortcut] = useHideShortcutStorage()
  useShortcuts(
    hideShortcut ? { [hideShortcut]: toggleDevtools() } : {},
    triggerRef
  )
  useGoBackOnEscape()
  // todo: hard coded panel sizes will get jank with scale changes, we should just auto calculate dynamically initially
  return (
    // TODO: determine for each panel if it: resizes, drags, closes on click outside
    <>
      <PanelRoute name="panel-selector">
        <MenuPanel />
      </PanelRoute>

      <PanelRoute name="preferences">
        <DynamicPanel
          sharePanelSizeGlobally={false}
          sizeConfig={{
            kind: 'fixed',
            height: 750,
            width: 480 + 32,
          }}
          closeOnClickOutside
          header={<DevToolsHeader title="Preferences" />}
        >
          <UserPreferencesWrapper />
        </DynamicPanel>
      </PanelRoute>

      <PanelRoute name="route-type">
        <DynamicPanel
          sharePanelSizeGlobally={false}
          sizeConfig={{
            kind: 'fixed',
            height: 300,
            width: 400,
          }}
          closeOnClickOutside
          header={
            <DevToolsHeader
              title={`${state.staticIndicator ? 'Static' : 'Dynamic'} Route`}
            />
          }
        >
          <RouteInfoBody
            routerType={state.routerType}
            isStaticRoute={state.staticIndicator}
            style={{
              padding: '16px',
            }}
          />
        </DynamicPanel>
      </PanelRoute>

      {process.env.__NEXT_DEVTOOL_SEGMENT_EXPLORER && (
        <PanelRoute name="segment-explorer">
          <DynamicPanel
            sharePanelSizeGlobally={false}
            sharePanelPositionGlobally={false}
            draggable
            sizeConfig={{
              kind: 'resizable',
              // todo till refactor for strings
              maxHeight: 1500,
              maxWidth: 1500,
              minHeight: 200,
              minWidth: 250,
              initialSize: {
                height: 300,
                width: 400,
              },
            }}
            header={<DevToolsHeader title="Route Info" />}
          >
            <PageSegmentTree
              isAppRouter={state.routerType === 'app'}
              page={state.page}
            />
          </DynamicPanel>
        </PanelRoute>
      )}

      <PanelRoute name="turbo-info">
        {/* todo dedupe all these names */}
        <DynamicPanel
          sharePanelSizeGlobally={false}
          sizeConfig={{
            kind: 'fixed',
            height: 425,
            width: 400,
          }}
          // todo: fix scroll on header so its fixed and body scrolls
          closeOnClickOutside
          header={<DevToolsHeader title="Turbopack Info" />}
        >
          <TurbopackInfoBody
            style={{
              padding: '16px',
              paddingTop: '8px',
            }}
          />
        </DynamicPanel>
      </PanelRoute>
    </>
  )
}

const UserPreferencesWrapper = () => {
  const { dispatch, state } = useDevOverlayContext()

  const [hideShortcut, setHideShortcut] = useHideShortcutStorage()

  // todo, need:
  /**
   * shortcut listener (i broke it because i was playing around with hide toolbar state should be easy fix)
   * focus trap
   * the select index stuff
   * maybe?
   * all defined in devtools popover in dev-tools-indicator.tsx
   */

  return (
    <div
      style={{
        padding: '16px',
        paddingTop: '8px',
      }}
    >
      <UserPreferencesBody
        position={state.devToolsPosition}
        scale={state.scale}
        setScale={(scale) => {
          dispatch({
            type: ACTION_DEVTOOLS_SCALE,
            scale,
          })
        }}
        setPosition={(devToolsPosition) => {
          dispatch({
            type: ACTION_DEVTOOLS_POSITION,
            devToolsPosition,
          })
        }}
        hideShortcut={hideShortcut}
        setHideShortcut={setHideShortcut}
        hide={() => {
          dispatch({
            type: ACTION_DEV_INDICATOR_SET,
            disabled: true,
          })

          fetch('/__nextjs_disable_dev_indicator', {
            method: 'POST',
          })
        }}
      />
    </div>
  )
}

export const usePanelContext = () => useContext(PanelContext)
export const PanelContext = createContext<{
  name: PanelStateKind
  mounted: boolean
}>(null!)
// this router should be able to be enhanced by Activity and ViewTransition trivially when we want to use them
function PanelRoute({
  children,
  name,
}: {
  children: React.ReactNode
  name: PanelStateKind
}) {
  const { panel } = usePanelRouterContext()
  const { mounted, rendered } = useDelayedRender(name === panel, {
    enterDelay: 0,
    exitDelay: MENU_DURATION_MS,
  })

  if (!mounted) return null

  return (
    <PanelContext
      value={{
        name,
        mounted,
      }}
    >
      <div
        id="panel-route"
        style={{
          opacity: rendered ? 1 : 0,
          transition: `opacity ${MENU_DURATION_MS}ms ${MENU_CURVE}`,
        }}
      >
        {children}
      </div>
    </PanelContext>
  )
}
