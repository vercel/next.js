export function generateStaticParams() {
  return [{ author: 'next', id: '123' }]
}

export default function AuthorIdPage() {
  return <div id="user-regular-page">Regular Page</div>
}
