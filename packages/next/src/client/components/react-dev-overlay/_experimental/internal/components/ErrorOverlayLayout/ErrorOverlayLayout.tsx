import type { VersionInfo } from '../../../../../../../server/dev/parse-version-info'
import { Dialog, DialogHeader, DialogBody, DialogContent } from '../Dialog'
import { Overlay } from '../Overlay'
import { VersionStalenessInfo } from '../VersionStalenessInfo'

type ErrorOverlayLayoutProps = {
  errorType:
    | 'Build Error'
    | 'Runtime Error'
    | 'Console Error'
    | 'Unhandled Runtime Error'
    | 'Missing Required HTML Tag'
  errorMessage: string | React.ReactNode
  onClose: () => void
  isBuildError?: boolean
  versionInfo?: VersionInfo
  children?: React.ReactNode
}

export function ErrorOverlayLayout({
  errorType,
  errorMessage,
  onClose,
  children,
  versionInfo,
  isBuildError,
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
            <h1
              id="nextjs__container_errors_label"
              className="nextjs__container_errors_label"
            >
              {errorType}
            </h1>
            <VersionStalenessInfo versionInfo={versionInfo} />
            <p
              id="nextjs__container_errors_desc"
              className="nextjs__container_errors_desc"
            >
              {errorMessage}
            </p>
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            {children}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Overlay>
  )
}
