const _ = {
  children: [
    '',
    {},
    {
      layout: [
        () =>
          Promise.resolve(/*! import() eager */).then(
            __webpack_require__.bind(
              __webpack_require__,
              /*! ./app/layout.tsx */ '(sc_server)/./app/layout.tsx'
            )
          ),
        '/home/pearman/dev/vercel/next.js/test/e2e/app-dir/catchall-not-found/app/layout.tsx',
      ],
      'not-found': [
        () =>
          Promise.resolve(/*! import() eager */).then(
            __webpack_require__.bind(
              __webpack_require__,
              /*! ./app/not-found.tsx */ '(sc_server)/./app/not-found.tsx'
            )
          ),
        '/home/pearman/dev/vercel/next.js/test/e2e/app-dir/catchall-not-found/app/not-found.tsx',
      ],
    },
  ],
}
