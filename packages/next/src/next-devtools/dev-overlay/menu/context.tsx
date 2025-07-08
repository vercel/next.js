import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { Overlays } from "../components/errors/dev-tools-indicator/dev-tools-indicator";

export const MenuContext = createContext<{
  closeMenu: () => void
  selectedIndex: number
  setSelectedIndex: Dispatch<SetStateAction<number>>
}>(null!)
export const useMenuContext = () => useContext(MenuContext)

export type PanelStateKind =
  | 'preferences'
  | 'route-info'
  | 'segment-explorer'
  | 'panel-selector'
  | 'turbo-info'


export const PanelContext = createContext<{
  panel: PanelStateKind | null
  setPanel: Dispatch<SetStateAction<PanelStateKind | null>>
  open: Overlays | null
setOpen: Dispatch<SetStateAction<Overlays | null>>  
}>(null!)

export const usePanelContext = () => useContext(PanelContext)