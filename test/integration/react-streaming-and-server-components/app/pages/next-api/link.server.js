import NextLink from 'next/link'

export default function Link() {
  return (
    <NextLink href={`/`}>
      <a>go home</a>
    </NextLink>
  )
}
