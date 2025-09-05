import { CODE_FRAME_STYLES } from '../components/code-frame/code-frame'
import { styles as dialog } from '../components/dialog'
import { styles as errorLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'
import { styles as bottomStack } from '../components/errors/error-overlay-bottom-stack'
import { styles as pagination } from '../components/errors/error-overlay-pagination/error-overlay-pagination'
import { styles as overlay } from '../components/overlay/styles'
import { styles as footer } from '../components/errors/error-overlay-footer/error-overlay-footer'
import { TERMINAL_STYLES } from '../components/terminal/terminal'
import { styles as versionStaleness } from '../components/version-staleness-info/version-staleness-info'
import { styles as buildErrorStyles } from '../container/build-error'
import { styles as containerErrorStyles } from '../container/errors'
import { styles as containerRuntimeErrorStyles } from '../container/runtime-error'
import { COPY_BUTTON_STYLES } from '../components/copy-button'
import { CALL_STACK_FRAME_STYLES } from '../components/call-stack-frame/call-stack-frame'
import { css } from '../utils/css'
import { EDITOR_LINK_STYLES } from '../components/terminal/editor-link'
import { ENVIRONMENT_NAME_LABEL_STYLES } from '../components/errors/environment-name-label/environment-name-label'
import { DEV_TOOLS_INFO_TURBOPACK_INFO_STYLES } from '../components/errors/dev-tools-indicator/dev-tools-info/turbopack-info'
import { DEV_TOOLS_INFO_ROUTE_INFO_STYLES } from '../components/errors/dev-tools-indicator/dev-tools-info/route-info'
import { DEV_TOOLS_INFO_USER_PREFERENCES_STYLES } from '../components/errors/dev-tools-indicator/dev-tools-info/user-preferences'
import { FADER_STYLES } from '../components/fader'
import { CALL_STACK_STYLES } from '../components/call-stack/call-stack'
import { SHORTCUT_RECORDER_STYLES } from '../components/errors/dev-tools-indicator/dev-tools-info/shortcut-recorder'

export function ComponentStyles() {
  return (
    <style>
      {css`
        ${COPY_BUTTON_STYLES}
        ${CALL_STACK_FRAME_STYLES}
        ${CALL_STACK_STYLES}
        ${ENVIRONMENT_NAME_LABEL_STYLES}
        ${overlay}
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
        ${DEV_TOOLS_INFO_TURBOPACK_INFO_STYLES}
        ${DEV_TOOLS_INFO_ROUTE_INFO_STYLES}
        ${DEV_TOOLS_INFO_USER_PREFERENCES_STYLES}
        ${FADER_STYLES}
        ${SHORTCUT_RECORDER_STYLES}
      `}
    </style>
  )
}
