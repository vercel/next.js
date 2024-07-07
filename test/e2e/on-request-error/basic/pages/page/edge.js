export default function Page() {
  throw new Error('pages-page-edge-error')
}

export const config = {
  revalidate: 0,
  runtime: 'experimental-edge',
}
