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

function loadScriptsInSequence(scripts, hydrate) {
  if (!scripts || !scripts.length) {
    return hydrate()
  }

  return scripts
    .reduce((promise, [src, props]) => {
      return promise.then(() => {
        return new Promise((resolve, reject) => {
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
            el.onload = resolve
            el.onerror = reject
          } else if (props) {
            el.innerHTML = props.children
            setTimeout(resolve)
          }

          document.head.appendChild(el)
        })
      })
    }, Promise.resolve())
    .then(() => {
      hydrate()
    })
    .catch((err) => {
      console.error(err)
      // Still try to hydrate even if there's an error.
      hydrate()
    })
}

export function appBootstrap(callback) {
  loadScriptsInSequence(self.__next_s, () => {
    callback()
  })
}
