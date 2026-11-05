import 'react-dom/unstable_server-external-runtime'

const iconInstructionSelector = 'template[data-next-icon]'

function relocateIcons(root: ParentNode): boolean {
  const instruction =
    root instanceof Element && root.matches(iconInstructionSelector)
      ? root
      : root.querySelector(iconInstructionSelector)

  if (!instruction) {
    return false
  }

  document
    .querySelectorAll(
      'body link[rel="icon"], body link[rel="apple-touch-icon"]'
    )
    .forEach((icon) => document.head.appendChild(icon))
  instruction.remove()
  return true
}

if (!relocateIcons(document) && document.readyState === 'loading') {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && relocateIcons(node)) {
          observer.disconnect()
          return
        }
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      relocateIcons(document)
      observer.disconnect()
    },
    { once: true }
  )
}
