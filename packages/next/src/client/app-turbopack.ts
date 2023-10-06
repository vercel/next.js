declare let __turbopack_require__: any

// @ts-expect-error
process.env.__NEXT_NEW_LINK_BEHAVIOR = true

// eslint-disable-next-line no-undef
;(self as any).__next_require__ = __turbopack_require__

// @ts-ignore
// eslint-disable-next-line no-undef
;(self as any).__next_chunk_load__ = __turbopack_load__

export {}
