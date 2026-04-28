import type { VersionInfo } from '../../../../../server/dev/parse-version-info'

import { ErrorOverlayPagination } from '../error-overlay-pagination/error-overlay-pagination'
import { VersionStalenessInfo } from '../../version-staleness-info/version-staleness-info'
import type { ReadyRuntimeError } from '../../../utils/get-error-by-type'

type ErrorOverlayNavProps = {
  runtimeErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
  versionInfo?: VersionInfo
  isTurbopack?: boolean
}

export function ErrorOverlayNav({
  runtimeErrors,
  activeIdx,
  setActiveIndex,
  versionInfo,
}: ErrorOverlayNavProps) {
  const bundlerName = (process.env.__NEXT_BUNDLER || 'Turbopack') as
    | 'Turbopack'
    | 'Webpack'
    | 'Rspack'

  return (
    <div data-nextjs-error-overlay-nav>
      <Notch side="left">
        {/* TODO: better passing data instead of nullish coalescing */}
        <ErrorOverlayPagination
          runtimeErrors={runtimeErrors ?? []}
          activeIdx={activeIdx ?? 0}
          onActiveIndexChange={setActiveIndex ?? (() => {})}
        />
      </Notch>
      {versionInfo && (
        <Notch side="right">
          <VersionStalenessInfo
            versionInfo={versionInfo}
            bundlerName={bundlerName}
          />
        </Notch>
      )}
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

    width: 100%;

    position: relative;
    z-index: 2;
    outline: none;
    translate: var(--next-dialog-border-width) var(--next-dialog-border-width);
    max-width: var(--next-dialog-max-width);

    .error-overlay-notch {
      translate: calc(var(--next-dialog-border-width) * -1);
      width: auto;
      height: var(--next-dialog-notch-height);
      padding: 12px;
      background: var(--background-color);
      border: var(--next-dialog-border-width) solid var(--stroke-color);
      border-bottom: none;
      position: relative;

      &[data-side='left'] {
        padding-right: 0;
        border-radius: var(--next-dialog-radius) 0 0 0;
      }

      &[data-side='right'] {
        padding-left: 0;
        border-radius: 0 var(--next-dialog-radius) 0 0;
      }
    }
  }

  @media (max-width: 600px) {
    [data-nextjs-error-overlay-nav] {
      background: var(--background-color);
      border-radius: var(--next-dialog-radius) var(--next-dialog-radius) 0 0;
      border: var(--next-dialog-border-width) solid var(--stroke-color);
      border-bottom: none;
      overflow: hidden;
      translate: 0 var(--next-dialog-border-width);
      
      .error-overlay-notch {
        border-radius: 0;
        border: 0;

        &[data-side="left"], &[data-side="right"] {
          border-radius: 0;
        }
      }
    }
  }
`

function Notch({
  children,
  side = 'left',
}: {
  children: React.ReactNode
  side?: 'left' | 'right'
}) {
  return (
    <div className="error-overlay-notch" data-side={side}>
      {children}
    </div>
  )
}