export default function MyError() {
  if (typeof window === 'undefined') {
    throw new Error('oops')
  }
}

export const config = {
  runtime: 'experimental-edge',
}
