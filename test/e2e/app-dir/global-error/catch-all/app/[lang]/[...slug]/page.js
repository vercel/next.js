export default async function Page({ params }) {
  if ((await params).slug[0] === 'error') {
    throw new Error('trigger error')
  }
  return 'catch-all page'
}
