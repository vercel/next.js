async function getCachedRandom(n) {
  'use cache: custom'
  return String(Math.ceil(Math.random() * n))
}

export default async function Page() {
  'use cache: custom'
  return 'Page 2: ' + getCachedRandom(10)
}
