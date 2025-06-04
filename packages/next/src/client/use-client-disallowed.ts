const error = new Proxy(
  {},
  {
    get(_target) {
      throw new Error(
        'Using Client Components is not allowed in this environment.'
      )
    },
  }
)
export default new Proxy(
  {},
  {
    get: (_target, p) => {
      if (p === '__esModule') return true
      return error
    },
  }
)
