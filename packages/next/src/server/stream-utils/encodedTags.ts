export const ENCODED_TAGS = {
  // opening tags do not have the closing `>` since they can contain other attributes such as `<body className=''>`
  OPENING: {
    // <html
    HTML: new Uint8Array([60, 104, 116, 109, 108]),
    // <body
    BODY: new Uint8Array([60, 98, 111, 100, 121]),
  },
  CLOSED: {
    // </head>
    HEAD: new Uint8Array([60, 47, 104, 101, 97, 100, 62]),
    // </body>
    BODY: new Uint8Array([60, 47, 98, 111, 100, 121, 62]),
    // </html>
    HTML: new Uint8Array([60, 47, 104, 116, 109, 108, 62]),
    // </body></html>
    BODY_AND_HTML: new Uint8Array([
      60, 47, 98, 111, 100, 121, 62, 60, 47, 104, 116, 109, 108, 62,
    ]),
  },
} as const
