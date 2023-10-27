/**
 * Before starting the Next.js runtime and requiring any module, we need to make
 * sure the following scripts are executed in the correct order:
 * - Polyfills
 * - next/script with `beforeInteractive` strategy
 */

const version = process.env.__NEXT_VERSION

window.next = {
  version,
  appDir: true,
}

function loadScriptsInSequence(
  scripts: [src: string, props: { [prop: string]: any }][],
  hydrate: () => void
) {
  if (!scripts || !scripts.length) {
    return hydrate()
  }

  return scripts
    .reduce((promise, [src, props]) => {
      return promise.then(() => {
        return new Promise<void>((resolve, reject) => {
          const el = document.createElement('script')

          if (props) {
            for (const key in props) {
              if (key !== 'children') {
                el.setAttribute(key, props[key])
              }
            }
          }

          if (src) {
            el.src = src
            el.onload = () => resolve()
            el.onerror = reject
          } else if (props) {
            el.innerHTML = props.children
            setTimeout(resolve)
          }

          document.head.appendChild(el)
        })
      })
    }, Promise.resolve())
    .catch((err: Error) => {
      console.error(err)
      // Still try to hydrate even if there's an error.
    })
    .then(() => {
      hydrate()
    })
}

export function appBootstrap(callback: () => void) {
  loadScriptsInSequence((self as any).__next_s, () => {
    callback()
  })
}
