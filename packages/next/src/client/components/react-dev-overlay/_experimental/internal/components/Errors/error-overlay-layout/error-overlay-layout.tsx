import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import type { DebugInfo } from '../../../../../types'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'
import type { ErrorMessageType } from '../error-message/error-message'
import type { ErrorType } from '../error-type-label/error-type-label'

import {
  Dialog,
  DialogHeader,
  DialogBody,
  DialogContent,
  DialogFooter,
} from '../../Dialog'
import { Overlay } from '../../Overlay'
import { ErrorPagination } from '../ErrorPagination/ErrorPagination'
import {
  ToolButtonsGroup,
  styles as toolButtonsGroupStyles,
} from '../../ToolButtonsGroup/ToolButtonsGroup'
import { VersionStalenessInfo } from '../../VersionStalenessInfo'
import { ErrorOverlayBottomStacks } from '../error-overlay-bottom-stacks/error-overlay-bottom-stacks'
import { ErrorOverlayFooter } from '../error-overlay-footer/error-overlay-footer'
import { noop as css } from '../../../helpers/noop-template'
import {
  ErrorMessage,
  styles as errorMessageStyles,
} from '../error-message/error-message'
import {
  ErrorTypeLabel,
  styles as errorTypeLabelStyles,
} from '../error-type-label/error-type-label'

type ErrorOverlayLayoutProps = {
  errorMessage: ErrorMessageType
  errorType: ErrorType
  children?: React.ReactNode
  errorCode?: string
  error?: Error
  debugInfo?: DebugInfo
  isBuildError?: boolean
  onClose?: () => void
  versionInfo?: VersionInfo
  // TODO: better handle receiving
  readyErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
  footerMessage?: string
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
  versionInfo,
  readyErrors,
  activeIdx,
  setActiveIndex,
  footerMessage,
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
              <ErrorTypeLabel errorType={errorType} />
              <ToolButtonsGroup error={error} debugInfo={debugInfo} />
            </div>
            <VersionStalenessInfo versionInfo={versionInfo} />
            <ErrorMessage errorMessage={errorMessage} />
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            {children}
          </DialogBody>
          <DialogFooter>
            {/* TODO: errorCode should not be undefined whatsoever */}
            <ErrorOverlayFooter
              footerMessage={footerMessage}
              errorCode={errorCode!}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ErrorOverlayBottomStacks
        errorsCount={readyErrors?.length ?? 0}
        activeIdx={activeIdx ?? 0}
      />
    </Overlay>
  )
}

export const styles = css`
  ${errorTypeLabelStyles}
  ${errorMessageStyles}
  ${toolButtonsGroupStyles}
`
