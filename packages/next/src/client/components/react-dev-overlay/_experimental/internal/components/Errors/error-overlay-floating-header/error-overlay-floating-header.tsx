import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'

import { ErrorPagination } from '../ErrorPagination/ErrorPagination'
import { VersionStalenessInfo } from '../../VersionStalenessInfo'
import { noop as css } from '../../../helpers/noop-template'

type ErrorOverlayFloatingHeaderProps = {
  readyErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
  versionInfo?: VersionInfo
}

export function ErrorOverlayFloatingHeader({
  readyErrors,
  activeIdx,
  setActiveIndex,
  versionInfo,
}: ErrorOverlayFloatingHeaderProps) {
  return (
    <div className="error-overlay-floating-header">
      {/* TODO: better passing data instead of nullish coalescing */}
      <ErrorPagination
        readyErrors={readyErrors ?? []}
        activeIdx={activeIdx ?? 0}
        onActiveIndexChange={setActiveIndex ?? (() => {})}
      />
      <VersionStalenessInfo versionInfo={versionInfo} />
    </div>
  )
}

export const styles = css`
  .error-overlay-floating-header {
    display: flex;
    width: 100%;
    margin-right: auto;
    margin-left: auto;
    margin-bottom: var(--size-2);
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
