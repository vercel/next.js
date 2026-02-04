export default function Error() {
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    throw new Error('error in pages/with-error')
  }
  return <div>with-error</div>
}
