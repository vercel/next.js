export default function ServerPage() {
  // String.prototype.replaceAll requires polyfill for older targets
  const text = 'x-y-z'
  const result = text.replaceAll('-', '_')

  return <p id="server-result">{result}</p>
}
