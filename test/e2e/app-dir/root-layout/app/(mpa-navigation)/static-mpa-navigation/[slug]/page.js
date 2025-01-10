import Link from 'next/link'

export const dynamicParams = false

export default async function Page(props) {
  const params = await props.params
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
