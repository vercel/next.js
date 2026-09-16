// Generated from React Grab 0.2.0 (ea4bbec9e80f4802e8ae19ad18431edb9ddbb670). MIT; see LICENSE.
export interface ReactGrabRendererProps {
  selectionVisible?: boolean;
  selectionBounds?: OverlayBounds;
  selectionBoundsMultiple?: OverlayBounds[];
  selectionShouldSnap?: boolean;
  selectionElementsCount?: number;
  frozenLabelEntryAccessors?: FrozenLabelEntryAccessor[];
  pendingShiftPreviewEntry?: FrozenLabelEntry;
  selectionFilePath?: string;
  selectionTagName?: string;
  selectionComponentName?: string;
  selectionLabelVisible?: boolean;
  selectionLabelStatus?: SelectionLabelStatus;
  hierarchyState?: HierarchyState;
  hierarchyMenuPosition?: DropdownAnchor | null;
  labelInstances?: SelectionLabelInstance[];
  labelInstanceAccessors?: SelectionLabelInstanceAccessor[];
  dragVisible?: boolean;
  dragBounds?: OverlayBounds;
  grabbedBoxes?: Array<{
    id: string;
    bounds: OverlayBounds;
    createdAt: number;
  }>;
  mouseX?: number;
  isFrozen?: boolean;
  inputValue?: string;
  isPromptMode?: boolean;
  onShowContextMenuInstance?: (instanceId: string) => void;
  onRetryInstance?: (instanceId: string) => void;
  onAcknowledgeErrorInstance?: (instanceId: string) => void;
  onLabelInstanceHoverChange?: (instanceId: string, isHovered: boolean) => void;
  onInputChange?: (value: string) => void;
  onInputSubmit?: () => void;
  selectionLabelShakeCount?: number;
  onConfirmDismiss?: () => void;
  onOpenSelectionFile?: () => void;
  discardPrompt?: SelectionDiscardPrompt;
  toolbarVisible?: boolean;
  isActive?: boolean;
  onToggleActive?: () => void;
  activeActionId?: string | null;
  enabled?: boolean;
  shakeCount?: number;
  onToolbarStateChange?: (state: ToolbarState) => void;
  onSubscribeToToolbarStateChanges?: (callback: (state: ToolbarState) => void) => () => void;
  onToolbarSelectHoverChange?: (isHovered: boolean) => void;
  onToolbarRef?: (element: HTMLDivElement) => void;
  contextMenuPosition?: Position | null;
  contextMenuBounds?: OverlayBounds | null;
  contextMenuTagName?: string;
  contextMenuComponentName?: string;
  contextMenuHasFilePath?: boolean;
  actions?: ContextMenuAction[];
  actionContext?: ActionContext;
  onContextMenuDismiss?: () => void;
  onContextMenuHide?: () => void;
  toolbarMenuPosition?: DropdownAnchor | null;
  toolbarMenuActions?: ContextMenuAction[];
  defaultActionId?: string;
  defaultActionLabel?: string;
  onSetDefaultAction?: (actionId: string) => void;
  onToggleToolbarMenu?: () => void;
  onToolbarMenuDismiss?: () => void;
}

export interface OverlayBounds {
  borderRadius: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FrozenLabelEntryAccessor {
  read: () => FrozenLabelEntry | null;
}

export interface FrozenLabelEntry {
  tagName: string;
  componentName?: string;
  bounds: OverlayBounds;
  mouseX?: number;
}

export type SelectionLabelStatus = "idle" | "copying" | "copied" | "fading" | "error";

export interface HierarchyState {
  items: HierarchyItem[];
  activeIndex: number;
}

export interface HierarchyItem {
  tagName: string;
  componentName?: string;
  // Indentation level within the hierarchy tree (0 = outermost ancestor).
  depth: number;
  // Whether this row is the last among its displayed siblings, used to pick
  // the terminal-style connector glyph (└─ vs ├─).
  isLast: boolean;
}

export interface DropdownAnchor {
  x: number;
  y: number;
  edge: ToolbarState["edge"];
}

export interface ToolbarState {
  edge: "top" | "bottom" | "left" | "right";
  ratio: number;
  collapsed: boolean;
  enabled: boolean;
  defaultAction?: string;
}

export interface SelectionLabelInstance {
  id: string;
  bounds: OverlayBounds;
  boundsMultiple?: OverlayBounds[];
  tagName: string;
  componentName?: string;
  elementsCount?: number;
  status: SelectionLabelStatus;
  statusText?: string;
  isPromptMode?: boolean;
  inputValue?: string;
  createdAt: number;
  element?: Element;
  elements?: Element[];
  mouseX?: number;
  mouseXOffsetFromCenter?: number;
  mouseXOffsetRatio?: number;
  errorMessage?: string;
  hideArrow?: boolean;
}

export interface SelectionLabelInstanceAccessor {
  read: () => SelectionLabelInstance | null;
}

export interface SelectionDiscardPrompt {
  isKeyboardSelection?: boolean;
  label?: string;
  cancelOnEscape?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onCopy?: () => void;
}

export interface Position {
  x: number;
  y: number;
}

export interface ContextMenuAction {
  id: string;
  label: string;
  shortcut?: string;
  shortcutModifier?: boolean;
  showInToolbarMenu?: boolean;
  enabled?: boolean | ((context: ActionContext) => boolean);
  onAction: (context: ContextMenuActionContext) => void | Promise<void>;
}

export interface ActionContext {
  element: Element;
  elements: Element[];
  filePath?: string;
  lineNumber?: number;
  componentName?: string;
  tagName?: string;
  enterPromptMode?: () => void;
  hooks: ActionContextHooks;
  performWithFeedback: (action: () => Promise<boolean>) => Promise<void>;
  hideContextMenu: () => void;
  cleanup: () => void;
}

export interface ActionContextHooks extends OpenFileActionHooks {
  transformHtmlContent: (html: string, elements: Element[]) => Promise<string>;
}

export interface OpenFileActionHooks {
  onOpenFile: (filePath: string, lineNumber?: number) => boolean | void;
  transformOpenFileUrl: (url: string, filePath: string, lineNumber?: number) => string;
}

export interface ContextMenuActionContext extends ActionContext {
  copy?: () => void;
}

export interface ReactGrabRendererHandle {
  update(props: ReactGrabRendererProps): void
  dispose(): void
}
export declare const styles: string
export declare function mountReactGrabRenderer(
  root: HTMLElement,
  initialProps: ReactGrabRendererProps
): ReactGrabRendererHandle
