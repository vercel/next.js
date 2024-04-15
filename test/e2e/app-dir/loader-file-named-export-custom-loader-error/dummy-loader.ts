export function dummyLoader({ src, width, quality }) {
  return `/_next/image/?url=${src}&w=${width}&q=${quality || 50}`
}
