export default function Page() {
  throw new Error('pages-error-edge')
}

export const config = {
  revalidate: 0,
  runtime: 'experimental-edge',
}
