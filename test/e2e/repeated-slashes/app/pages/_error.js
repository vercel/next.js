if (typeof window !== 'undefined') {
  window.errorLoad = true
}

export default function Page() {
  return <p id="error">custom error</p>
}
