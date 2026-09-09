export function generateStaticParams() {
  return [{ author: 'next', id: '123' }]
}

export default function InterceptedAuthorIdPage() {
  return <div id="user-intercept-page">Intercepted Page</div>
}
