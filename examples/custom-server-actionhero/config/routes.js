exports['default'] = {
  routes: (api) => {
    return {
      get: [{ path: '/', matchTrailingPathParts: true, action: 'render' }],
    }
  },
}
