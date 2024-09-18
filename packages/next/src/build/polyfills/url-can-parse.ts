// Since URL.canParse is available in Node.js v18.17.0 and later,
// we only need to patch it for the client.
if (typeof window !== 'undefined') {
  // patch URL.canParse to be available in older browsers e.g. Safari 16
  // x-ref: https://github.com/vercel/next.js/pull/70215
  // x-ref: https://caniuse.com/?search=URL.canParse
  if (!('canParse' in URL)) {
    ;(URL as any).canParse = (url: string, base?: string): boolean => {
      try {
        return !!new URL(url, base)
      } catch {
        return false
      }
    }
  }
}
