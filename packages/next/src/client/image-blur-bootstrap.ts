export type ImageWithBlur = HTMLImageElement & {
  __nextImageHydrated?: boolean
  __nextImageBlur?: {
    src: string
    srcSet: string
    sizes: string
    cleanup: () => void
  }
}

// Serialized into the HTML. Keep this function self-contained: it runs before
// any Next.js bundles, including the Image component, have loaded.
export function imageBlurBootstrap() {
  const doc = document as Document & { __nextImageBlur?: boolean }
  if (doc.__nextImageBlur || !CSS.supports('background-image', 'revert-layer'))
    return
  doc.__nextImageBlur = true
  const nonce = (doc.currentScript as HTMLScriptElement | null)?.nonce
  let style: HTMLStyleElement | undefined
  const active = new Set<ImageWithBlur>()
  const freeRules: CSSStyleRule[] = []
  const observer = new MutationObserver(() => {
    active.forEach((img) => {
      const early = img.__nextImageBlur!
      if (
        !img.isConnected ||
        img.src !== early.src ||
        img.srcset !== early.srcSet ||
        img.sizes !== early.sizes
      ) {
        early.cleanup()
        delete img.__nextImageBlur
      }
    })
  })

  function complete(img: ImageWithBlur) {
    if (
      img.tagName !== 'IMG' ||
      !img.hasAttribute('data-nimg-placeholder') ||
      img.__nextImageHydrated
    ) {
      return
    }
    const src = img.src
    const srcSet = img.srcset
    const sizes = img.sizes
    const currentSrc = img.currentSrc
    const decoded =
      img.naturalWidth && img.decode ? img.decode() : Promise.resolve()
    decoded
      .catch(() => {})
      .then(() => {
        if (
          img.__nextImageHydrated ||
          !img.isConnected ||
          !img.complete ||
          img.src !== src ||
          img.srcset !== srcSet ||
          img.sizes !== sizes ||
          img.currentSrc !== currentSrc
        ) {
          return
        }
        img.__nextImageBlur?.cleanup()
        if (!style) {
          style = doc.createElement('style')
          style.setAttribute('data-next-image-blur', '')
          if (nonce) style.nonce = nonce
          doc.head.appendChild(style)
        }
        const sheet = style.sheet
        // A script nonce does not necessarily authorize a stylesheet. Keep the
        // normal React loading path when the site's style policy blocks it.
        if (!sheet) {
          style.remove()
          style = undefined
          return
        }
        const key = CSS.escape(img.getAttribute('data-nimg-placeholder')!)
        const selector = `[data-nimg-placeholder="${key}"]`
        const rule =
          freeRules.pop() ||
          (sheet.cssRules[
            sheet.insertRule(`${selector}{}`, sheet.cssRules.length)
          ] as CSSStyleRule)
        rule.selectorText = selector
        rule.style.cssText = ['image', 'size', 'position', 'repeat']
          .map((name) => `--next-image-${name}:initial!important;`)
          .join('')
        if (!active.size)
          observer.observe(doc.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'sizes'],
          })
        active.add(img)
        let cleaned = false
        // Only private custom properties change. The background declarations
        // retain the user's cascade, and React-owned attributes stay untouched.
        img.__nextImageBlur = {
          src,
          srcSet,
          sizes,
          cleanup() {
            // A stale cleanup must not release a rule reused by a later load.
            if (cleaned) return
            cleaned = true
            active.delete(img)
            rule.style.cssText = ''
            freeRules.push(rule)
            if (!active.size) {
              observer.disconnect()
              style?.remove()
              style = undefined
              freeRules.length = 0
            }
          },
        }
      })
  }

  function onComplete(event: Event) {
    if (event.target) complete(event.target as ImageWithBlur)
  }
  // Load/error do not bubble. Capture also covers images arriving in later HTML
  // chunks without waiting for hydration. The observer only lives while early
  // overrides need to be cleaned up on request changes or removal.
  doc.addEventListener('load', onComplete, true)
  doc.addEventListener('error', onComplete, true)
  doc
    .querySelectorAll<ImageWithBlur>('img[data-nimg-placeholder]')
    .forEach((img) => {
      if (img.complete) complete(img)
    })
}
