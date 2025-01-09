import { CODE_FRAME_STYLES } from '../components/CodeFrame/CodeFrame'
import { styles as dialog } from '../components/Dialog'
import { styles as errorLayout } from '../components/Errors/error-overlay-layout/error-overlay-layout'
import { styles as bottomStacks } from '../components/Errors/error-overlay-bottom-stacks/error-overlay-bottom-stacks'
import { styles as pagination } from '../components/Errors/error-overlay-pagination/error-overlay-pagination'
import { styles as overlay } from '../components/Overlay/styles'
import { styles as footer } from '../components/Errors/error-overlay-footer/error-overlay-footer'
import { styles as terminal } from '../components/Terminal/styles'
import { styles as toast } from '../components/Toast'
import { styles as versionStaleness } from '../components/VersionStalenessInfo/VersionStalenessInfo'
import { styles as buildErrorStyles } from '../container/BuildError'
import { styles as containerErrorStyles } from '../container/Errors'
import { styles as containerRuntimeErrorStyles } from '../container/RuntimeError'
import { COPY_BUTTON_STYLES } from '../components/copy-button'
import { CALL_STACK_FRAME_STYLES } from '../components/call-stack-frame/call-stack-frame'
import { styles as devToolsIndicator } from '../components/Errors/dev-tools-indicator/styles'
import { noop as css } from '../helpers/noop-template'

export function ComponentStyles() {
  return (
    <style>
      {css`
        ${COPY_BUTTON_STYLES}
        ${CALL_STACK_FRAME_STYLES}
        ${overlay}
        ${toast}
        ${dialog}
        ${errorLayout}
        ${footer}
        ${bottomStacks}
        ${pagination}
        ${CODE_FRAME_STYLES}
        ${terminal}
        ${buildErrorStyles}
        ${containerErrorStyles}
        ${containerRuntimeErrorStyles}
        ${versionStaleness}
        ${devToolsIndicator}
      `}
    </style>
  )
}
