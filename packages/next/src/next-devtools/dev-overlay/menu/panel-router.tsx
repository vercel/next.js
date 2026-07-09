import { usePanelRouterContext, type PanelStateKind } from './context'
import { ChevronRight, DevtoolMenu, IssueCount } from './dev-overlay-menu'
import { getIssueBucketState } from './issue-bucket-state'
import { DynamicPanel } from '../panel/dynamic-panel'
import {
  learnMoreLink,
  RouteInfoBody,
} from '../components/errors/dev-tools-indicator/dev-tools-info/route-info'
import { PageSegmentTree } from '../components/overview/segment-explorer'
import { DevToolsHeader } from '../components/errors/dev-tools-indicator/dev-tools-info/dev-tools-header'
import { useDelayedRender } from '../hooks/use-delayed-render'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../components/errors/dev-tools-indicator/utils'
import { useDevOverlayContext } from '../../dev-overlay.browser'
import { createContext, useContext, useEffect, useRef } from 'react'
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
import { InstantNavsPanel } from '../components/instant-navs/instant-navs-panel'
import './panel-router.css'
import { CacheDisabledBody } from '../components/errors/dev-tools-indicator/dev-tools-info/cache-disabled'
import { ColdCacheBody } from '../components/errors/dev-tools-indicator/dev-tools-info/cold-cache'

const MenuPanel = () => {
  const { setPanel, setSelectedIndex } = usePanelRouterContext()
  const { state, dispatch } = useDevOverlayContext()
  const { normalErrorCount, instantErrorCount } = useRenderErrorContext()
  const isAppRouter = state.routerType === 'app'

  const { hasNormal, hasInstant, hasAny } = getIssueBucketState(
    normalErrorCount,
    instantErrorCount
  )

  const titleParts: string[] = []
  if (hasNormal) {
    titleParts.push(
      `${normalErrorCount} ${normalErrorCount === 1 ? 'issue' : 'issues'}`
    )
  }
  if (hasInstant) {
    titleParts.push(
      `${instantErrorCount} ${instantErrorCount === 1 ? 'insight' : 'insights'}`
    )
  }
  const label =
    hasNormal && hasInstant
      ? 'Issues · Insights'
      : hasInstant
        ? 'Insights'
        : 'Issues'

  return (
    <DevtoolMenu
      items={[
        hasAny && {
          title: `${titleParts.join(' · ')} found. Click to view details in the dev overlay.`,
          label,
          value: (
            <span className="dev-tools-indicator-issue-counts">
              {hasNormal && (
                <IssueCount variant="issue">{normalErrorCount}</IssueCount>
              )}
              {hasInstant && (
                <IssueCount variant="insight">{instantErrorCount}</IssueCount>
              )}
            </span>
          ),
          onClick: () => {
            if (state.isErrorOverlayOpen) {
              dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
              setPanel(null)
              return
            }
            setPanel(null)
            setSelectedIndex(-1)
            dispatch({ type: ACTION_ERROR_OVERLAY_OPEN })
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
              label: 'Bundler',
              value: 'Turbopack',
            }
          : {
              title:
                'Learn about Turbopack and how to enable it in your application.',
              label: 'Bundler',
              value: (
                <a
                  href="https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="turbopack-upgrade-link"
                >
                  {process.env.__NEXT_BUNDLER || 'Turbopack'}
                </a>
              ),
            },
        !!process.env.__NEXT_CACHE_COMPONENTS && {
          title: 'Cache Components is enabled.',
          label: 'Cache Components',
          value: 'Enabled',
        },
        isAppRouter &&
          !!process.env.__NEXT_INSTANT_NAV_TOGGLE && {
            title: 'Test instant navigation behavior.',
            label: 'Navigation Inspector',
            value: <ChevronRight />,
            onClick: () => {
              setPanel('instant-navs')
            },
            attributes: {
              'data-instant-nav': true,
            },
          },
        state.cacheIndicator === 'bypass' && {
          title:
            'Caching is currently disabled (bypassed). Click to learn more.',
          label: 'Cache',
          value: 'Disabled',
          onClick: () => setPanel('cache-disabled'),
          attributes: {
            'data-cache-disabled': true,
          },
        },
        state.cacheIndicator === 'cold' && {
          title:
            'This load filled one or more caches while streaming, so it is not representative of production. Click to learn more.',
          label: 'Cache',
          value: 'Cold',
          onClick: () => setPanel('cold-cache'),
          attributes: {
            'data-cold-cache': true,
          },
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
  const { triggerRef, setPanel } = usePanelRouterContext()
  const toggleDevtools = useToggleDevtoolsVisibility()
  const isAppRouter = state.routerType === 'app'

  // True while the error overlay is open, cleared on a deferred tick so the single
  // ESC that closes the overlay does not also release the capture (the instant
  // panel's ESC handler runs later in that same keystroke). A later ESC releases.
  const errorOverlayOpenRef = useRef(false)
  useEffect(() => {
    if (state.isErrorOverlayOpen) {
      errorOverlayOpenRef.current = true
      return
    }
    const timeout = setTimeout(() => {
      errorOverlayOpenRef.current = false
    })
    return () => clearTimeout(timeout)
  }, [state.isErrorOverlayOpen])

  // Returns to the menu, which ends the capture via the panel-switch effect.
  // Exceptions: clicking outside is ignored (keeps the frozen page interactive);
  // an ESC that just closed the error overlay is ignored (errorOverlayOpenRef).
  const closeInstantPanel = (reason?: 'escape' | 'outside') => {
    if (reason === 'outside') {
      return
    }
    if (reason === 'escape' && errorOverlayOpenRef.current) {
      return
    }
    setPanel('panel-selector')
  }

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

      {isAppRouter && !!process.env.__NEXT_INSTANT_NAV_TOGGLE && (
        <PanelRoute name="instant-navs">
          <DynamicPanel
            sharePanelSizeGlobally={false}
            sharePanelPositionGlobally={false}
            draggable
            keepBehindErrorOverlay
            onClose={closeInstantPanel}
            sizeConfig={{
              kind: 'auto',
              width: 460 / state.scale,
            }}
            header={
              <DevToolsHeader
                title="Navigation Inspector"
                onClose={() => closeInstantPanel()}
              />
            }
          >
            <InstantNavsPanel />
          </DynamicPanel>
        </PanelRoute>
      )}

      {state.cacheIndicator === 'bypass' && (
        <PanelRoute name="cache-disabled">
          <DynamicPanel
            sharePanelSizeGlobally={false}
            sizeConfig={{
              kind: 'fixed',
              height: 340 / state.scale,
              width: 480 / state.scale,
            }}
            closeOnClickOutside
            header={<DevToolsHeader title="Cache disabled" />}
          >
            <div className="panel-content">
              <CacheDisabledBody />
            </div>
          </DynamicPanel>
        </PanelRoute>
      )}

      {state.cacheIndicator === 'cold' && (
        <PanelRoute name="cold-cache">
          <DynamicPanel
            sharePanelSizeGlobally={false}
            sizeConfig={{
              kind: 'fixed',
              height: 400 / state.scale,
              width: 480 / state.scale,
            }}
            closeOnClickOutside
            header={<DevToolsHeader title="Cold cache" />}
          >
            <div className="panel-content">
              <ColdCacheBody />
            </div>
          </DynamicPanel>
        </PanelRoute>
      )}
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
