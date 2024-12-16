export type DebugInfo = {
  devtoolsFrontendUrl: string | undefined
}

export type ErrorType = 'runtime' | 'build'

export type ReactDevOverlayProps = {
  children: React.ReactNode
  preventDisplay?: ErrorType[]
  globalOverlay?: boolean
}
