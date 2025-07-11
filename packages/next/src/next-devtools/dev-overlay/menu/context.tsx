import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react'

export type PanelStateKind =
  | 'preferences'
  | 'route-info'
  | 'segment-explorer'
  | 'panel-selector'
  | 'turbo-info'

export const PanelRouterContext = createContext<{
  panel: PanelStateKind | null
  setPanel: Dispatch<SetStateAction<PanelStateKind | null>>
  triggerRef: React.RefObject<HTMLButtonElement | null>
}>(null!)

export const usePanelRouterContext = () => useContext(PanelRouterContext)
