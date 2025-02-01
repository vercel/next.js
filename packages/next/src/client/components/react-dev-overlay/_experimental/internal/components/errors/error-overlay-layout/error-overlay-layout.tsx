import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import type { DebugInfo } from '../../../../../types'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'
import type { ErrorMessageType } from '../error-message/error-message'
import type { ErrorType } from '../error-type-label/error-type-label'

import { DialogContent, DialogFooter } from '../../dialog'
import {
  ErrorOverlayToolbar,
  styles as toolbarStyles,
} from '../error-overlay-toolbar/error-overlay-toolbar'
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
import {
  ErrorOverlayFloatingHeader,
  styles as floatingHeaderStyles,
} from '../error-overlay-floating-header/error-overlay-floating-header'

import { ErrorOverlayDialog, DIALOG_STYLES } from '../dialog/dialog'
import {
  ErrorOverlayDialogHeader,
  DIALOG_HEADER_STYLES,
} from '../dialog/header'
import { ErrorOverlayDialogBody, DIALOG_BODY_STYLES } from '../dialog/body'
import { CALL_STACK_STYLES } from '../call-stack/call-stack'
import { OVERLAY_STYLES, ErrorOverlayOverlay } from '../overlay/overlay'

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
  isTurbopack?: boolean
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
  isTurbopack,
}: ErrorOverlayLayoutProps) {
  return (
    <ErrorOverlayOverlay fixed={isBuildError}>
      <ErrorOverlayDialog onClose={onClose} isTurbopack={isTurbopack}>
        <DialogContent>
          <ErrorOverlayFloatingHeader
            readyErrors={readyErrors}
            activeIdx={activeIdx}
            setActiveIndex={setActiveIndex}
            versionInfo={versionInfo}
            isTurbopack={isTurbopack}
          />

          <ErrorOverlayDialogHeader isTurbopack={isTurbopack}>
            <div
              className="nextjs__container_errors__error_title"
              // allow assertion in tests before error rating is implemented
              data-nextjs-error-code={errorCode}
            >
              <ErrorTypeLabel errorType={errorType} />
              <ErrorOverlayToolbar error={error} debugInfo={debugInfo} />
            </div>
            <ErrorMessage errorMessage={errorMessage} />
          </ErrorOverlayDialogHeader>

          <ErrorOverlayDialogBody>{children}</ErrorOverlayDialogBody>

          <DialogFooter>
            <ErrorOverlayFooter
              footerMessage={footerMessage}
              errorCode={errorCode}
            />
            <ErrorOverlayBottomStacks
              errorsCount={readyErrors?.length ?? 0}
              activeIdx={activeIdx ?? 0}
            />
          </DialogFooter>
        </DialogContent>
      </ErrorOverlayDialog>
    </ErrorOverlayOverlay>
  )
}

export const styles = css`
  ${OVERLAY_STYLES}
  ${DIALOG_STYLES}
  ${DIALOG_HEADER_STYLES}
  ${DIALOG_BODY_STYLES}

  ${floatingHeaderStyles}
  ${errorTypeLabelStyles}
  ${errorMessageStyles}
  ${toolbarStyles}
  ${CALL_STACK_STYLES}
`
