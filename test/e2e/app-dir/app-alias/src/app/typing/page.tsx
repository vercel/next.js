// Typing test
function noop() {
  fetch('/button', { next: { revalidate: 0 } })
  const request = new Request('/button', { next: { revalidate: 0 } })
  fetch(request)
}

export default function page() {
  return 'typing'
}
