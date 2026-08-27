import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/product/999" id="to-missing-product">
      missing product
    </Link>
  )
}
