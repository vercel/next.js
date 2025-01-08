import type { ReadyRuntimeError } from '../../../helpers/get-error-by-type'
import type { DebugInfo } from '../../../../../types'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'
import type { ErrorMessageType } from '../error-message/error-message'
import type { ErrorType } from '../error-type-label/error-type-label'

import { DialogBody, DialogContent, DialogFooter } from '../../Dialog'
import { Overlay } from '../../Overlay'
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
import { ErrorOverlayDialog, styles as dialogStyles } from '../dialog/dialog'
import {
  ErrorOverlayDialogHeader,
  styles as dialogHeaderStyles,
} from '../dialog/dialog-header'

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

      <ErrorOverlayDialog onClose={onClose}>
        <ErrorOverlayFloatingHeader
          readyErrors={readyErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          versionInfo={versionInfo}
        />
        <DialogContent>
          <ErrorOverlayDialogHeader>
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
        <ErrorOverlayBottomStacks
          errorsCount={readyErrors?.length ?? 0}
          activeIdx={activeIdx ?? 0}
        />
      </ErrorOverlayDialog>
    </Overlay>
  )
}

export const styles = css`
  ${dialogStyles}
  ${dialogHeaderStyles}
  ${floatingHeaderStyles}
  ${errorTypeLabelStyles}
  ${errorMessageStyles}
  ${toolbarStyles}
`
