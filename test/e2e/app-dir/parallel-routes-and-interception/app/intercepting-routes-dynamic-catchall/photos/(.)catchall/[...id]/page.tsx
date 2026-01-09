export function generateStaticParams() {
  return [{ id: ['123'] }]
}

export default function InterceptPage() {
  return <div id="catchall-intercept-page">Intercepted Page</div>
}
