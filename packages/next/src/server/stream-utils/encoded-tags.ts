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
  META: {
    // Only the match the prefix cause the suffix can be different wether it's xml compatible or not ">" or "/>"
    // <meta name="«nxt-icon»"
    // This is a special mark that will be replaced by the icon insertion script tag.
    ICON_MARK: new Uint8Array([
      60, 109, 101, 116, 97, 32, 110, 97, 109, 101, 61, 34, 194, 171, 110, 120,
      116, 45, 105, 99, 111, 110, 194, 187, 34,
    ]),
  },
} as const
