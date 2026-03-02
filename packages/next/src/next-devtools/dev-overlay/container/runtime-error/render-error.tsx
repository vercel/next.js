import type { OverlayState } from '../../shared'

export type SupportedErrorEvent = {
  id: number
  error: Error & { environmentName?: string }
  type: 'runtime' | 'recoverable' | 'console'
}

interface Props {
  children: (params: {
    runtimeErrors: readonly SupportedErrorEvent[]
    totalErrorCount: number
  }) => React.ReactNode
  state: OverlayState
}

export const RenderError = (props: Props) => {
  const { state } = props
  const isBuildError = !!state.buildError

  if (isBuildError) {
    return <RenderBuildError {...props} />
  } else {
    return <RenderRuntimeError {...props} />
  }
}

const RenderRuntimeError = ({ children, state }: Props) => {
  const { errors } = state

  return children({ runtimeErrors: errors, totalErrorCount: errors.length })
}

const RenderBuildError = ({ children }: Props) => {
  return children({
    runtimeErrors: [],
    // Build errors and missing root layout tags persist until fixed,
    // so we can set a fixed error count of 1
    totalErrorCount: 1,
  })
}
