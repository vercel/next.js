export default function PagesRuntimeErrorPage() {
  if (typeof window !== 'undefined') {
    throw new Error('Test Pages runtime error')
  }

  return <p>Server render</p>
}
