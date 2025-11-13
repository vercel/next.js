import { usePanelRouterContext, type PanelStateKind } from './context'
import { ChevronRight, DevtoolMenu, IssueCount } from './dev-overlay-menu'
import { DynamicPanel } from '../panel/dynamic-panel'
import {
  learnMoreLink,
  RouteInfoBody,
} from '../components/errors/dev-tools-indicator/dev-tools-info/route-info'
import { PageSegmentTree } from '../components/overview/segment-explorer'
import { TurbopackInfoBody } from '../components/errors/dev-tools-indicator/dev-tools-info/turbopack-info'
import { DevToolsHeader } from '../components/errors/dev-tools-indicator/dev-tools-info/dev-tools-header'
import { useDelayedRender } from '../hooks/use-delayed-render'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../components/errors/dev-tools-indicator/utils'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { createContext, useContext } from 'react'
import { useRenderErrorContext } from '../dev-overlay'
import {
  ACTION_DEV_INDICATOR_SET,
  ACTION_DEVTOOLS_POSITION,
  ACTION_DEVTOOLS_SCALE,
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
} from '../shared'
import GearIcon from '../icons/gear-icon'
import { LoadingIcon } from '../icons/loading-icon'
import { UserPreferencesBody } from '../components/errors/dev-tools-indicator/dev-tools-info/user-preferences'
import { useShortcuts } from '../hooks/use-shortcuts'
import { useUpdateAllPanelPositions } from '../components/devtools-indicator/devtools-indicator'
import { saveDevToolsConfig } from '../utils/save-devtools-config'
import './panel-router.css'

const MenuPanel = () => {
  const { setPanel, setSelectedIndex } = usePanelRouterContext()
  const { state, dispatch } = useDevOverlayContext()
  const { totalErrorCount } = useRenderErrorContext()
  const isAppRouter = state.routerType === 'app'

  return (
    <DevtoolMenu
      items={[
        totalErrorCount > 0 && {
          title: `${totalErrorCount} ${totalErrorCount === 1 ? 'issue' : 'issues'} found. Click to view details in the dev overlay.`,
          label: 'Issues',
          value: <IssueCount>{totalErrorCount}</IssueCount>,
          onClick: () => {
            if (state.isErrorOverlayOpen) {
              dispatch({
                type: ACTION_ERROR_OVERLAY_CLOSE,
              })
              setPanel(null)
              return
            }
            setPanel(null)
            setSelectedIndex(-1)
            if (totalErrorCount > 0) {
              dispatch({
                type: ACTION_ERROR_OVERLAY_OPEN,
              })
            }
          },
        },
        state.staticIndicator === 'disabled'
          ? undefined
          : state.staticIndicator === 'pending'
            ? {
                title: 'Loading...',
                label: 'Route',
                value: <LoadingIcon />,
              }
            : {
                title: `Current route is ${state.staticIndicator}.`,
                label: 'Route',
                value:
                  state.staticIndicator === 'static' ? 'Static' : 'Dynamic',
                onClick: () => setPanel('route-type'),
                attributes: {
                  'data-nextjs-route-type': state.staticIndicator,
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
        !!process.env.__NEXT_CACHE_COMPONENTS && {
          title: 'Cache Components is enabled.',
          label: 'Cache Components',
          value: 'Enabled',
        },
        isAppRouter && {
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

// a little hacky but it does the trick
const useToggleDevtoolsVisibility = () => {
  const { state, dispatch, shadowRoot } = useDevOverlayContext()
  return () => {
    dispatch({
      type: ACTION_DEV_INDICATOR_SET,
      disabled: !state.disableDevIndicator,
    })

    const menuElement = shadowRoot.getElementById('panel-route') as HTMLElement
    const indicatorElement = shadowRoot.getElementById(
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

export const PanelRouter = () => {
  const { state } = useDevOverlayContext()
  const { triggerRef } = usePanelRouterContext()
  const toggleDevtools = useToggleDevtoolsVisibility()
  const isAppRouter = state.routerType === 'app'

  useShortcuts(
    state.hideShortcut ? { [state.hideShortcut]: toggleDevtools } : {},
    triggerRef
  )

  return (
    <>
      <PanelRoute name="panel-selector">
        <MenuPanel />
      </PanelRoute>

      {/* TODO: NEXT-4644 */}
      <PanelRoute name="preferences">
        <DynamicPanel
          sharePanelSizeGlobally={false}
          sizeConfig={{
            kind: 'fixed',
            height: 500 / state.scale,
            width: 480 + 32,
          }}
          closeOnClickOutside
          header={<DevToolsHeader title="Preferences" />}
        >
          <UserPreferencesWrapper />
        </DynamicPanel>
      </PanelRoute>

      {state.staticIndicator !== 'disabled' &&
        state.staticIndicator !== 'pending' && (
          <PanelRoute name="route-type">
            <DynamicPanel
              key={state.staticIndicator}
              sharePanelSizeGlobally={false}
              sizeConfig={{
                kind: 'fixed',
                height:
                  state.staticIndicator === 'static'
                    ? 300 / state.scale
                    : 325 / state.scale,
                width: 400 / state.scale,
              }}
              closeOnClickOutside
              header={
                <DevToolsHeader
                  title={`${state.staticIndicator === 'static' ? 'Static' : 'Dynamic'} Route`}
                />
              }
            >
              <div className="panel-content">
                <RouteInfoBody
                  routerType={state.routerType}
                  isStaticRoute={state.staticIndicator === 'static'}
                />
                <InfoFooter
                  href={learnMoreLink[state.routerType][state.staticIndicator]}
                />
              </div>
            </DynamicPanel>
          </PanelRoute>
        )}

      {isAppRouter && (
        <PanelRoute name="segment-explorer">
          <DynamicPanel
            sharePanelSizeGlobally={false}
            sharePanelPositionGlobally={false}
            draggable
            sizeConfig={{
              kind: 'resizable',
              maxHeight: '90vh',
              maxWidth: '90vw',
              minHeight: 200 / state.scale,
              minWidth: 250 / state.scale,
              initialSize: {
                height: 375 / state.scale,
                width: 400 / state.scale,
              },
            }}
            header={<DevToolsHeader title="Route Info" />}
          >
            <PageSegmentTree page={state.page} />
          </DynamicPanel>
        </PanelRoute>
      )}

      <PanelRoute name="turbo-info">
        <DynamicPanel
          sharePanelSizeGlobally={false}
          sizeConfig={{
            kind: 'fixed',
            height: 470 / state.scale,
            width: 400 / state.scale,
          }}
          closeOnClickOutside
          header={<DevToolsHeader title="Try Turbopack" />}
        >
          <div className="panel-content">
            <TurbopackInfoBody />
            <InfoFooter href="https://nextjs.org/docs/app/api-reference/turbopack" />
          </div>
        </DynamicPanel>
      </PanelRoute>
    </>
  )
}

const InfoFooter = ({ href }: { href: string }) => {
  return (
    <div className="dev-tools-info-button-container">
      <a
        className="dev-tools-info-learn-more-button"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
      >
        Learn More
      </a>
    </div>
  )
}

const UserPreferencesWrapper = () => {
  const { dispatch, state } = useDevOverlayContext()
  const { setPanel, setSelectedIndex } = usePanelRouterContext()
  const updateAllPanelPositions = useUpdateAllPanelPositions()

  return (
    <div className="user-preferences-wrapper">
      <UserPreferencesBody
        theme={state.theme}
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
          updateAllPanelPositions(devToolsPosition)
        }}
        hideShortcut={state.hideShortcut}
        setHideShortcut={(value) => {
          saveDevToolsConfig({ hideShortcut: value })
        }}
        hide={() => {
          dispatch({
            type: ACTION_DEV_INDICATOR_SET,
            disabled: true,
          })
          setSelectedIndex(-1)
          setPanel(null)
          fetch('/__nextjs_disable_dev_indicator', {
            method: 'POST',
          })
        }}
      />
    </div>
  )
}

export const usePanelContext = () => useContext(PanelContext)
const PanelContext = createContext<{
  name: PanelStateKind
  mounted: boolean
}>(null!)
// this router can be enhanced by Activity and ViewTransition trivially when we want to use them
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
        className="panel-route"
        style={
          {
            '--panel-opacity': rendered ? 1 : 0,
            '--panel-transition': `opacity ${MENU_DURATION_MS}ms ${MENU_CURVE}`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </PanelContext>
  )
}
