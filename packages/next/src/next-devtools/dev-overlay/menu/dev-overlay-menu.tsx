import { useDevOverlayContext } from '../../dev-overlay.browser'
import { MENU_DURATION_MS } from '../components/errors/dev-tools-indicator/utils'
import { useRenderErrorContext } from '../dev-overlay'
import { useDelayedRender } from '../hooks/use-delayed-render'
import GearIcon from '../icons/gear-icon'
import { ACTION_ERROR_OVERLAY_OPEN } from '../shared'
import { MenuContext, usePanelContext } from './context'
import { MenuItem } from './menu-item'

/**
 *
 * SYNC WITH REAL MENU THIS IS MISSING A LOT
 */
export const DevtoolMenu = () => {
  const isTurbopack = !!process.env.TURBOPACK
  const { dispatch, state } = useDevOverlayContext()
  const { totalErrorCount } = useRenderErrorContext()
  const { panel, setPanel } = usePanelContext()
  const { mounted: menuMounted, rendered: menuRendered } = useDelayedRender(
    panel === 'panel-selector',
    {
      // Intentionally no fade in, makes the UI feel more immediate
      enterDelay: 0,
      // Graceful fade out to confirm that the UI did not break
      exitDelay: MENU_DURATION_MS,
    }
  )

  return menuMounted ? (
    <div
      // what reef is this again
      // ref={menuRef}
      id="nextjs-dev-tools-menu"
      role="menu"
      dir="ltr"
      aria-orientation="vertical"
      aria-label="Next.js Dev Tools Items"
      tabIndex={-1}
      className="dev-tools-indicator-menu"
      // todo reimpl this
      // onKeyDown={onMenuKeydown}
      data-rendered={menuRendered}
      style={{
        // this is probably totally broken, hold up
        bottom: 'calc(100% + 8px)',
        left: '8px', // maybe fixed now?
      }}
    >
      {/* this provider should be higher in tree? eh maybe not */}
      <MenuContext
        value={{
          // pass as context as source of truth when needed, or just stuff state
          // here that doesn't need to be scoped
          closeMenu: () => {},
          selectedIndex: -1,
          setSelectedIndex: () => {},
        }}
      >
        <div className="dev-tools-indicator-inner">
          {/* how is this not distributed */}
          {totalErrorCount > 0 && (
            <MenuItem
              title={`${totalErrorCount} ${totalErrorCount === 1 ? 'issue' : 'issues'} found. Click to view details in the dev overlay.`}
              index={0}
              label="Issues"
              value={<IssueCount>{totalErrorCount}</IssueCount>}
              onClick={function openErrorOverlay() {
                // setOpen(null)
                setPanel(null)
                if (totalErrorCount > 0) {
                  dispatch({
                    type: ACTION_ERROR_OVERLAY_OPEN,
                  })
                }
              }}
            />
          )}
          <MenuItem
            title={`Current route is ${state.staticIndicator ? 'static' : 'dynamic'}.`}
            label="Route"
            index={1}
            value={state.staticIndicator ? 'Static' : 'Dynamic'}
            onClick={
              () => setPanel('route-info')

              // setOpen(OVERLAYS.Route)
            }
            data-nextjs-route-type={
              state.staticIndicator ? 'static' : 'dynamic'
            }
          />
          {!!process.env.TURBOPACK ? (
            <MenuItem
              title="Turbopack is enabled."
              label="Turbopack"
              value="Enabled"
            />
          ) : (
            <MenuItem
              index={2}
              title="Learn about Turbopack and how to enable it in your application."
              label="Try Turbopack"
              value={<ChevronRight />}
              onClick={
                () => setPanel('turbo-info')
                // setOpen(OVERLAYS.Turbo)
                // null
                // todo dunno yet
              }
            />
          )}
        </div>

        <div className="dev-tools-indicator-footer">
          <MenuItem
            data-preferences
            label="Preferences"
            value={<GearIcon />}
            onClick={
              () => setPanel('preferences')
              // setOpen(OVERLAYS.Preferences)
            }
            index={isTurbopack ? 2 : 3}
          />
          <MenuItem
            data-segment-explorer
            label="Route Info"
            value={<ChevronRight />}
            onClick={
              () => setPanel('segment-explorer')
              // setOpen(OVERLAYS.SegmentExplorer)
            }
            index={isTurbopack ? 3 : 4}
          />
          {/* {process.env.__NEXT_DEVTOOL_SEGMENT_EXPLORER ? (
           
          ) : null} */}
        </div>
      </MenuContext>
    </div>
  ) : null
}

function IssueCount({ children }: { children: number }) {
  return (
    <span
      className="dev-tools-indicator-issue-count"
      data-has-issues={children > 0}
    >
      <span className="dev-tools-indicator-issue-count-indicator" />
      {children}
    </span>
  )
}

function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        fill="#666"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.50011 1.93945L6.03044 2.46978L10.8537 7.293C11.2442 7.68353 11.2442 8.31669 10.8537 8.70722L6.03044 13.5304L5.50011 14.0608L4.43945 13.0001L4.96978 12.4698L9.43945 8.00011L4.96978 3.53044L4.43945 3.00011L5.50011 1.93945Z"
      />
    </svg>
  )
}
