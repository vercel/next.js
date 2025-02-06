import { CODE_FRAME_STYLES } from '../components/code-frame/code-frame'
import { styles as dialog } from '../components/dialog'
import { styles as errorLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'
import { styles as bottomStack } from '../components/errors/error-overlay-bottom-stack'
import { styles as pagination } from '../components/errors/error-overlay-pagination/error-overlay-pagination'
import { styles as overlay } from '../components/overlay/styles'
import { styles as footer } from '../components/errors/error-overlay-footer/error-overlay-footer'
import { TERMINAL_STYLES } from '../components/terminal/terminal'
import { styles as toast } from '../components/toast'
import { styles as versionStaleness } from '../components/version-staleness-info/version-staleness-info'
import { styles as buildErrorStyles } from '../container/build-error'
import { styles as containerErrorStyles } from '../container/errors'
import { styles as containerRuntimeErrorStyles } from '../container/runtime-error'
import { COPY_BUTTON_STYLES } from '../components/copy-button'
import { CALL_STACK_FRAME_STYLES } from '../components/call-stack-frame/call-stack-frame'
import { styles as devToolsIndicator } from '../components/errors/dev-tools-indicator/styles'
import { noop as css } from '../helpers/noop-template'
import { EDITOR_LINK_STYLES } from '../components/terminal/editor-link'

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
        ${bottomStack}
        ${pagination}
        ${CODE_FRAME_STYLES}
        ${TERMINAL_STYLES}
        ${EDITOR_LINK_STYLES}
        ${buildErrorStyles}
        ${containerErrorStyles}
        ${containerRuntimeErrorStyles}
        ${versionStaleness}
        ${devToolsIndicator}
      `}
    </style>
  )
}
