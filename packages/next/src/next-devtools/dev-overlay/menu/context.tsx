import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react'

export type PanelStateKind =
  | 'preferences'
  | 'route-type'
  | 'segment-explorer'
  | 'panel-selector'
  | 'turbo-info'

export const PanelRouterContext = createContext<{
  panel: PanelStateKind | null
  setPanel: Dispatch<SetStateAction<PanelStateKind | null>>
  triggerRef: React.RefObject<HTMLButtonElement | null>
  selectedIndex: number
  setSelectedIndex: Dispatch<SetStateAction<number>>
}>(null!)

export const usePanelRouterContext = () => useContext(PanelRouterContext)
