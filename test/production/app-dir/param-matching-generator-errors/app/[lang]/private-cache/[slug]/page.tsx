async function getMatching() {
  'use cache: private'
  return { slug: 'blocking' }
}

export async function unstable_generateParamMatching() {
  return getMatching()
}

export default function Page() {
  return <p>private cache</p>
}
