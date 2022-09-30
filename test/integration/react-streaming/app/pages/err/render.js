let did = false
export default function MyError() {
  if (!did && typeof window === 'undefined') {
    did = true
    throw new Error('oops')
  }
}

export const config = {
  runtime: 'experimental-edge',
}
