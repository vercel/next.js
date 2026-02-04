export const revalidate = 0

export default function Page() {
  const err = new Error('this is a test')
  err.digest = 'custom'
  throw err
}
