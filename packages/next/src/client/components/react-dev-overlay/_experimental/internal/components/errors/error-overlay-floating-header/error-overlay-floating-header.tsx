import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'

import { ErrorOverlayPagination } from '../error-overlay-pagination/error-overlay-pagination'
import { VersionStalenessInfo } from '../../version-staleness-info/version-staleness-info'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayFloatingHeaderProps = {
  readyErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
  versionInfo?: VersionInfo
  isTurbopack?: boolean
}

export function ErrorOverlayFloatingHeader({
  readyErrors,
  activeIdx,
  setActiveIndex,
  versionInfo,
  isTurbopack,
}: ErrorOverlayFloatingHeaderProps) {
  return (
    <div className="error-overlay-floating-header">
      {/* TODO: better passing data instead of nullish coalescing */}
      <ErrorOverlayPagination
        readyErrors={readyErrors ?? []}
        activeIdx={activeIdx ?? 0}
        onActiveIndexChange={setActiveIndex ?? (() => {})}
      />
      <VersionStalenessInfo
        versionInfo={versionInfo}
        isTurbopack={isTurbopack}
      />
    </div>
  )
}

export const styles = css`
  .error-overlay-floating-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    width: 100%;
    position: fixed;
    transform: translateY(calc(-1 * var(--size-10_5)));

    outline: none;

    @media (min-width: 576px) {
      max-width: 540px;
    }

    @media (min-width: 768px) {
      max-width: 720px;
    }

    @media (min-width: 992px) {
      max-width: 960px;
    }
  }
`
