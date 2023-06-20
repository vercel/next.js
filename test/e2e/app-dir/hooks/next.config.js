module.exports = {
  rewrites: async () => {
    return {
      afterFiles: [
        {
          source: '/rewritten-use-search-params',
          destination:
            '/hooks/use-search-params?first=value&second=other%20value&third',
        },
        {
          source: '/rewritten-use-pathname',
          destination: '/hooks/use-pathname',
        },
        {
          source: '/hooks/use-selected-layout-segment/rewritten',
          destination:
            '/hooks/use-selected-layout-segment/first/slug3/second/catch/all',
        },
      ],
    }
  },
}
