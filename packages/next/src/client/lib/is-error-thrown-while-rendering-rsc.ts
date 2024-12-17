export const shouldRenderRootLevelErrorOverlay = () => {
  return !!window.__next_root_layout_missing_tags?.length
}
