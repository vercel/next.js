export default function Default() {
  console.log(
    '@bar default page',
    typeof window !== 'undefined' ? 'client' : 'server'
  )
  return '@bar default'
}

export const metadata = {
  title: '@bar - page',
}
