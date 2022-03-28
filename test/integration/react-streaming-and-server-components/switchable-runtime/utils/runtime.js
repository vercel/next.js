export default function Runtime() {
  let runtime

  if (typeof window !== 'undefined') {
    // We have to make sure it matches the existing markup when hydrating.
    runtime = document.getElementById('__runtime').textContent
  } else {
    runtime =
      'Runtime: ' +
      (process.version ? `Node.js ${process.version}` : 'Edge/Browser')
  }

  return <span id="__runtime">{runtime}</span>
}
