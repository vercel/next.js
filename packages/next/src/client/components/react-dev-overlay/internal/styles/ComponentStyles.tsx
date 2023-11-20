import * as React from 'react'

import { styles as codeFrame } from '../components/CodeFrame'
import { styles as dialog } from '../components/Dialog'
import { styles as leftRightDialogHeader } from '../components/LeftRightDialogHeader'
import { styles as overlay } from '../components/Overlay'
import { styles as tabs } from '../components/Tabs'
import { styles as terminal } from '../components/Terminal'
import { styles as toast } from '../components/Toast'
import { styles as versionStaleness } from '../components/VersionStalenessInfo'

import { styles as containerBuildErrorStyles } from '../container/BuildError'
import { styles as containerRootLayoutErrorStyles } from '../container/RootLayoutError'
import { styles as containerErrorStyles } from '../container/Errors'
import { styles as containerErrorToastStyles } from '../container/ErrorsToast'
import { styles as containerRuntimeErrorStyles } from '../container/RuntimeError'
// import { styles as containerTurbopackIssueStyles } from '../container/TurbopackIssue'

import { noop as css } from '../helpers/noop-template'

export function ComponentStyles(): React.ReactNode {
  return (
    <style>
      {css`
        ${overlay}
        ${toast}
        ${dialog}
        ${leftRightDialogHeader}
        ${codeFrame}
        ${terminal}
        ${tabs}
        ${versionStaleness}

        ${containerBuildErrorStyles}
        ${containerRootLayoutErrorStyles}
        ${containerErrorStyles}
        ${containerErrorToastStyles}
        ${containerRuntimeErrorStyles}
      `}
    </style>
  )
}
