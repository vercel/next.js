export default function Page() {
  console.log(
    'nested default page',
    typeof window !== 'undefined' ? 'client' : 'server'
  )
  return 'nested default page'
}

export const metadata = {
  title: 'nested - default',
}
