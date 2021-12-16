let did = false
export default function Error() {
  if (!did && typeof window === 'undefined') {
    did = true
    throw new Error('oops')
  }
}
