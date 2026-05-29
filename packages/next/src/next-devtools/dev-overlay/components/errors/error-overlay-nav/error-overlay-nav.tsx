import type { DebugInfo } from '../../../../shared/types'
import type { VersionInfo } from '../../../../../server/dev/parse-version-info'

import {
  ErrorOverlayPagination,
  type ErrorOverlayTabBarRenderer,
} from '../error-overlay-pagination/error-overlay-pagination'
import { ErrorOverlayToolbar } from '../error-overlay-toolbar/error-overlay-toolbar'
import type { ReadyRuntimeError } from '../../../utils/get-error-by-type'

type ErrorOverlayNavProps = {
  runtimeErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
  canGoPrevious?: boolean
  canGoNext?: boolean
  onPrevious?: () => void
  onNext?: () => void
  versionInfo?: VersionInfo
  error: ReadyRuntimeError['error']
  debugInfo?: DebugInfo
  generateErrorInfo: () => Promise<string>
  renderTabBar?: ErrorOverlayTabBarRenderer
}

export function ErrorOverlayNav({
  runtimeErrors,
  activeIdx,
  setActiveIndex,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  versionInfo,
  error,
  debugInfo,
  generateErrorInfo,
  renderTabBar,
}: ErrorOverlayNavProps) {
  const bundlerName = (process.env.__NEXT_BUNDLER || 'Turbopack') as
    | 'Turbopack'
    | 'Webpack'
    | 'Rspack'
  return (
    <div data-nextjs-error-overlay-nav>
      <NavItem side="left">
        {/* TODO: better passing data instead of nullish coalescing */}
        <ErrorOverlayPagination
          runtimeErrors={runtimeErrors ?? []}
          activeIdx={activeIdx ?? 0}
          onActiveIndexChange={setActiveIndex ?? (() => {})}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={onPrevious}
          onNext={onNext}
          renderTabBar={renderTabBar}
        />
      </NavItem>
      <NavItem side="right">
        <ErrorOverlayToolbar
          error={error}
          debugInfo={debugInfo}
          generateErrorInfo={generateErrorInfo}
          versionInfo={versionInfo}
          bundlerName={bundlerName}
        />
      </NavItem>
    </div>
  )
}

export const styles = `
  [data-nextjs-error-overlay-nav] {
    --stroke-color: var(--color-gray-400);
    --background-color: var(--color-background-100);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    width: 100%;

    position: relative;
    z-index: 2;
    outline: none;
    translate: var(--next-dialog-border-width) var(--next-dialog-border-width);
    max-width: var(--next-dialog-max-width);

    .error-overlay-nav-item {
      translate: calc(var(--next-dialog-border-width) * -1);
      width: auto;
      padding: 12px;
      position: relative;

      &[data-side='left'] {
        padding-right: 0;
      }

      &[data-side='right'] {
        padding-left: 0;
      }
    }
  }

  @media (max-width: 767px) {
    [data-nextjs-error-overlay-nav] {
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      -ms-overflow-style: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }
  }

`

function NavItem({
  children,
  side = 'left',
}: {
  children: React.ReactNode
  side?: 'left' | 'right'
}) {
  return (
    <div className="error-overlay-nav-item" data-side={side}>
      {children}
    </div>
  )
}
