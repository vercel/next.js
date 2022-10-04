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
}

loadScriptsInSequence(self.__next_scripts, () => {
  // Include app-router and layout-router in the main chunk
  import('next/dist/client/components/app-router.client.js')
  import('next/dist/client/components/layout-router.client.js')

  const { hydrate } = require('./app-index')
  hydrate()
})
