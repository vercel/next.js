import type { DebugInfo } from '../../../../../types'
import type { ErrorMessageType } from '../error-message/error-message'
import type { ErrorType } from '../error-type-label/error-type-label'

import { DialogContent, DialogFooter } from '../../dialog'
import {
  ErrorOverlayToolbar,
  styles as toolbarStyles,
} from '../error-overlay-toolbar/error-overlay-toolbar'
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
  ErrorOverlayNav,
  styles as floatingHeaderStyles,
} from '../error-overlay-nav/error-overlay-nav'

import { ErrorOverlayDialog, DIALOG_STYLES } from '../dialog/dialog'
import {
  ErrorOverlayDialogHeader,
  DIALOG_HEADER_STYLES,
} from '../dialog/header'
import { ErrorOverlayDialogBody, DIALOG_BODY_STYLES } from '../dialog/body'
import { CALL_STACK_STYLES } from '../call-stack/call-stack'
import { OVERLAY_STYLES, ErrorOverlayOverlay } from '../overlay/overlay'
import { ErrorOverlayBottomStack } from '../error-overlay-bottom-stack'
import type { ErrorBaseProps } from '../error-overlay/error-overlay'
import type { ReadyRuntimeError } from '../../../../../internal/helpers/get-error-by-type'
import { EnvironmentNameLabel } from '../environment-name-label/environment-name-label'

interface ErrorOverlayLayoutProps extends ErrorBaseProps {
  errorMessage: ErrorMessageType
  errorType: ErrorType
  children?: React.ReactNode
  errorCode?: string
  error: ReadyRuntimeError['error']
  debugInfo?: DebugInfo
  isBuildError?: boolean
  onClose?: () => void
  // TODO: better handle receiving
  runtimeErrors?: ReadyRuntimeError[]
  activeIdx?: number
  setActiveIndex?: (index: number) => void
  footerMessage?: string
  dialogResizerRef?: React.RefObject<HTMLDivElement | null>
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
  runtimeErrors,
  activeIdx,
  setActiveIndex,
  footerMessage,
  isTurbopack,
  dialogResizerRef,
  // This prop is used to animate the dialog, it comes from a parent component (<ErrorOverlay>)
  // If it's not being passed, we should just render the component as it is being
  // used without the context of a parent component that controls its state (e.g. Storybook).
  rendered = true,
  transitionDurationMs,
}: ErrorOverlayLayoutProps) {
  const animationProps = {
    'data-rendered': rendered,
    style: {
      '--transition-duration': `${transitionDurationMs}ms`,
    } as React.CSSProperties,
  }

  const hasFooter = Boolean(footerMessage || errorCode)

  return (
    <ErrorOverlayOverlay fixed={isBuildError} {...animationProps}>
      <div data-nextjs-dialog-root {...animationProps}>
        <ErrorOverlayDialog
          onClose={onClose}
          dialogResizerRef={dialogResizerRef}
          data-has-footer={hasFooter}
        >
          <DialogContent>
            <ErrorOverlayDialogHeader>
              <div
                className="nextjs__container_errors__error_title"
                // allow assertion in tests before error rating is implemented
                data-nextjs-error-code={errorCode}
              >
                <span data-nextjs-error-label-group>
                  <ErrorTypeLabel errorType={errorType} />
                  {error.environmentName && (
                    <EnvironmentNameLabel
                      environmentName={error.environmentName}
                    />
                  )}
                </span>
                <ErrorOverlayToolbar error={error} debugInfo={debugInfo} />
              </div>
              <ErrorMessage errorMessage={errorMessage} />
            </ErrorOverlayDialogHeader>

            <ErrorOverlayDialogBody>{children}</ErrorOverlayDialogBody>
          </DialogContent>
          {hasFooter && (
            <DialogFooter>
              <ErrorOverlayFooter
                footerMessage={footerMessage}
                errorCode={errorCode}
              />
            </DialogFooter>
          )}
          <ErrorOverlayBottomStack
            count={runtimeErrors?.length ?? 0}
            activeIdx={activeIdx ?? 0}
          />
        </ErrorOverlayDialog>
        <ErrorOverlayNav
          runtimeErrors={runtimeErrors}
          activeIdx={activeIdx}
          setActiveIndex={setActiveIndex}
          versionInfo={versionInfo}
          isTurbopack={isTurbopack}
        />
      </div>
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

  [data-nextjs-error-label-group] {
    display: flex;
    align-items: center;
    gap: var(--size-2);
  }
`
