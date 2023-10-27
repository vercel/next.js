import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link
        href="/prefetch-false/result"
        prefetch={false}
        id="to-prefetch-false-result"
      >
        To prefetch false
      </Link>
    </>
  )
}
