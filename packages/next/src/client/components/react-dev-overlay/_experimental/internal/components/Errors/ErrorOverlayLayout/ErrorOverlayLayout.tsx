import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import type { DebugInfo } from '../../../../../types'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'
import { Dialog, DialogHeader, DialogBody, DialogContent } from '../../Dialog'
import { Overlay } from '../../Overlay'
import { ErrorPagination } from '../ErrorPagination/ErrorPagination'
import { ToolButtonsGroup } from '../../ToolButtonsGroup/ToolButtonsGroup'
import { VersionStalenessInfo } from '../../VersionStalenessInfo'
import { ErrorOverlayBottomStacks } from '../error-overlay-bottom-stacks/error-overlay-bottom-stacks'

type ErrorOverlayLayoutProps = {
  errorMessage: string | React.ReactNode
  errorType:
    | 'Build Error'
    | 'Runtime Error'
    | 'Console Error'
    | 'Unhandled Runtime Error'
    | 'Missing Required HTML Tag'
  children?: React.ReactNode
  errorCode?: string
  error?: Error
  debugInfo?: DebugInfo
  isBuildError?: boolean
  onClose?: () => void
  // TODO: remove this
  temporaryHeaderChildren?: React.ReactNode
  versionInfo?: VersionInfo
  // TODO: better handle receiving
  readyErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
}

export function ErrorOverlayLayout({
  errorMessage,
  errorType,
  children,
  errorCode,
  error,
  debugInfo,
  isBuildError,
  onClose,
  temporaryHeaderChildren,
  versionInfo,
  readyErrors,
  activeIdx,
  setActiveIndex,
}: ErrorOverlayLayoutProps) {
  return (
    <Overlay fixed={isBuildError}>
      <Dialog
        type="error"
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        onClose={onClose}
      >
        <DialogContent>
          <DialogHeader className="nextjs-container-errors-header">
            {/* TODO: better passing data instead of nullish coalescing */}
            <ErrorPagination
              readyErrors={readyErrors ?? []}
              activeIdx={activeIdx ?? 0}
              onActiveIndexChange={setActiveIndex ?? (() => {})}
            />
            <div
              className="nextjs__container_errors__error_title"
              // allow assertion in tests before error rating is implemented
              data-nextjs-error-code={errorCode}
            >
              <h1
                id="nextjs__container_errors_label"
                className="nextjs__container_errors_label"
              >
                {errorType}
                {/* TODO: Need to relocate this so consider data flow. */}
              </h1>
              <ToolButtonsGroup error={error} debugInfo={debugInfo} />
            </div>
            <VersionStalenessInfo versionInfo={versionInfo} />
            <p
              id="nextjs__container_errors_desc"
              className="nextjs__container_errors_desc"
            >
              {errorMessage}
            </p>
            {temporaryHeaderChildren}
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            {children}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ErrorOverlayBottomStacks
        errorsCount={readyErrors?.length ?? 0}
        activeIdx={activeIdx ?? 0}
      />
    </Overlay>
  )
}
