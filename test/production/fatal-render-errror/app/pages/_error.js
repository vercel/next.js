export default function Error() {
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    throw new Error('error in custom _app')
  }
  return <div>Error encountered!</div>
}
