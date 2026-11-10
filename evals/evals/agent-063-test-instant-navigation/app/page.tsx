import Link from 'next/link'
export default function Home() {
  return (
    <Link href="/store/shoes" prefetch={true}>
      View shoes
    </Link>
  )
}
