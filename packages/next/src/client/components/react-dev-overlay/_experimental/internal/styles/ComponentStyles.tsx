import { styles as codeFrame } from '../components/CodeFrame/styles'
import { styles as dialog } from '../components/Dialog'
import { styles as errorLayout } from '../components/Errors/error-overlay-layout/error-overlay-layout'
import { styles as bottomStacks } from '../components/Errors/error-overlay-bottom-stacks/error-overlay-bottom-stacks'
import { styles as pagination } from '../components/Errors/ErrorPagination/styles'
import { styles as overlay } from '../components/Overlay/styles'
import { styles as footer } from '../components/Errors/error-overlay-footer/styles'
import { styles as terminal } from '../components/Terminal/styles'
import { styles as toast } from '../components/Toast'
import { styles as versionStaleness } from '../components/VersionStalenessInfo'
import { styles as buildErrorStyles } from '../container/BuildError'
import { styles as containerErrorStyles } from '../container/Errors'
import { styles as containerRuntimeErrorStyles } from '../container/RuntimeError'
import { noop as css } from '../helpers/noop-template'

export function ComponentStyles() {
  return (
    <style>
      {css`
        ${overlay}
        ${toast}
        ${dialog}
        ${errorLayout}
        ${footer}
        ${bottomStacks}
        ${pagination}
        ${codeFrame}
        ${terminal}
        ${buildErrorStyles}
        ${containerErrorStyles}
        ${containerRuntimeErrorStyles}
        ${versionStaleness}
      `}
    </style>
  )
}
