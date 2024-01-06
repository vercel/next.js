export default async function Page({ params }) {
  if (params.slug[0] === 'error') {
    throw new Error('trigger error')
  }
  return 'catch-all page'
}
