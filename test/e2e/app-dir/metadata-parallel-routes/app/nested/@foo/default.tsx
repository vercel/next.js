export default function Default() {
  console.log(
    'foo default default page',
    typeof window !== 'undefined' ? 'client' : 'server'
  )
  return '@foo default'
}

export const metadata = {
  title: '@foo - default',
}
