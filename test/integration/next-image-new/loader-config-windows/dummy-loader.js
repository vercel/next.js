export default function dummyLoader({ src, width, quality }) {
  return `${src}#w:${width},q:${quality || 50}`
}
