export const isErrorThrownWhileRenderingRsc = () => {
  return (
    window.document.documentElement.id === '__next_error__' ||
    !!window.__next_root_layout_missing_tags?.length
  )
}
