/// <reference path="../base/runtime-base.ts" />

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerBootstrapMetadata(
  attribute: string,
  register: (params: RuntimeParams) => void
) {
  if (typeof document === 'undefined') return

  const selector = `template[${attribute}]`

  function consumeTemplate(template: Element) {
    const value = template.getAttribute(attribute)
    if (value === null) return

    // Mutation records can refer to the same template more than once after a move.
    template.removeAttribute(attribute)
    template.remove()
    const registrations: RuntimeParams[] = JSON.parse(value)
    registrations.forEach(register)
  }

  function consumeTemplates(root: ParentNode) {
    root.querySelectorAll(selector).forEach(consumeTemplate)
  }

  if (document.readyState === 'loading') {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue
          const element = node as Element
          if (element.matches(selector)) consumeTemplate(element)
          consumeTemplates(element)
        }
      }
    })
    observer.observe(document, { childList: true, subtree: true })
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        // The parser can finish before its last mutation records are delivered.
        consumeTemplates(document)
        observer.disconnect()
      },
      { once: true }
    )
  }

  consumeTemplates(document)
}
