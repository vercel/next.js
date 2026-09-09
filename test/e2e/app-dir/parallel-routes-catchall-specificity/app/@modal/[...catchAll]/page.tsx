export function generateStaticParams() {
  return [{ catchAll: ['u', 'foobar', 'l'] }, { catchAll: ['trending'] }]
}

export default function CatchAll() {
  return null
}
