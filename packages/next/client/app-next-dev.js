// TODO-APP: hydration warning

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
  const { hydrate } = require('./app-index')

  hydrate()
})

// TODO-APP: build indicator
