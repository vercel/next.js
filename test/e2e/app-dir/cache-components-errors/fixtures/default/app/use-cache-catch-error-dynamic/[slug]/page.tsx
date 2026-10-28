export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  let message = 'fallback'

  try {
    message = await getMessage(slug)
  } catch {}

  return (
    <>
      <p>
        This page catches an error that's thrown in `'use cache'` for slugs that
        are not returned by `generateStaticParams`, and renders a fallback.
      </p>
      <p id="message">{message}</p>
    </>
  )
}

async function getMessage(slug: string) {
  'use cache'

  if (slug !== 'known') {
    throw new Error(`Kaputt: ${slug}`)
  }

  return `Slug: ${slug}`
}
