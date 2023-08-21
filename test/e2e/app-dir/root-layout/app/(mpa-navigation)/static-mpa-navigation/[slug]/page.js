import Link from 'next/link'

export const dynamicParams = false

export default function Page({ params }) {
  return (
    <>
      <Link
        href={
          params.slug === 'slug1'
            ? '/static-mpa-navigation/slug2'
            : '/basic-route'
        }
      >
        To next
      </Link>
      <p id={`static-${params.slug}`}>static {params.slug}</p>
    </>
  )
}
