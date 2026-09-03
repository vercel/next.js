export function generateStaticParams() {
  return [{ id: ['123'] }]
}

export default function InterceptedPage() {
  return <div id="optional-catchall-intercept-page">Intercepted Page</div>
}
