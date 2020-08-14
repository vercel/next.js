import * as React from 'react'
import { styles as codeFrame } from '../components/CodeFrame/styles'
import { styles as dialog } from '../components/Dialog'
import { styles as leftRightDialogHeader } from '../components/LeftRightDialogHeader/styles'
import { styles as overlay } from '../components/Overlay/styles'
import { styles as terminal } from '../components/Terminal/styles'
import { styles as toast } from '../components/Toast'
import { styles as buildErrorStyles } from '../container/BuildError'
import { styles as containerErrorStyles } from '../container/Errors'
import { styles as containerRuntimeErrorStyles } from '../container/RuntimeError'
import { noop as css } from '../helpers/noop-template'

export function ComponentStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          ${overlay}
          ${toast}
          ${dialog}
          ${leftRightDialogHeader}
          ${codeFrame}
          ${terminal}

          ${buildErrorStyles}
          ${containerErrorStyles}
          ${containerRuntimeErrorStyles}
        `,
      }}
    />
  )
}
