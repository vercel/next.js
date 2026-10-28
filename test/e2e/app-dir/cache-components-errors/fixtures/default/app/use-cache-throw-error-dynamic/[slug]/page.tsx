export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const message = await getMessage(slug)

  return (
    <>
      <p>
        This page doesn't catch an error that's thrown in `'use cache'` for
        slugs that are not returned by `generateStaticParams`.
      </p>
      <p id="message">{message}</p>
    </>
  )
}

async function getMessage(slug: string) {
  'use cache'

  if (slug !== 'known') {
    throw new Error(`Uncaught kaputt: ${slug}`)
  }

  return `Slug: ${slug}`
}
