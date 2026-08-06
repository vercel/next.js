export default async function Page() {
  const error = new Error('Client error!')
  ;(error as any).__NEXT_ERROR_CODE = 'E40'
  throw error

  return null
}
