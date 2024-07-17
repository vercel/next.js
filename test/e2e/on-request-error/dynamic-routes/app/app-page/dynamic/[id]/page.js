export default function Page({ searchParams }) {
  const search = new URLSearchParams(searchParams).toString()
  throw new Error(
    'server-dynamic-page-node-error' + (search ? `?${search}` : '')
  )
}
