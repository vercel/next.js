export function renderAppDevOverlay() {
  throw new Error(
    "Next DevTools: Can't render in this environment. This is a bug in Next.js"
  )
}

export function renderPagesDevOverlay() {
  throw new Error(
    "Next DevTools: Can't render in this environment. This is a bug in Next.js"
  )
}

// TODO: Extract into separate functions that are imported
export const dispatcher = new Proxy(
  {},
  {
    get: (_, prop) => {
      return () => {
        throw new Error(
          `Next DevTools: Can't dispatch ${String(prop)} in this environment. This is a bug in Next.js`
        )
      }
    },
  }
)
