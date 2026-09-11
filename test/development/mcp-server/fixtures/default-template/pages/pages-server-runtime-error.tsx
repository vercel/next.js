if (typeof window === 'undefined') {
  throw new Error('Test Pages server runtime error')
}

export default function PagesServerRuntimeErrorPage() {
  return <p>Client render</p>
}
