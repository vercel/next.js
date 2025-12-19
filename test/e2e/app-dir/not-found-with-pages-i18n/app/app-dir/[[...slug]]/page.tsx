import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  return [{ slug: ['about'] }]
}

async function validateSlug(slug: string[]) {
  try {
    const isValidPath =
      slug.length === 1 && (slug[0] === 'about' || slug[0] === 'contact')

    if (!isValidPath) {
      return false
    }

    return true
  } catch (error) {
    throw error
  }
}

export default async function CatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const slugArray = Array.isArray(slug) ? slug : [slug]

  // Validate the slug
  const isValid = await validateSlug(slugArray)

  // If not valid, show 404
  if (!isValid) {
    notFound()
  }

  return (
    <div>
      <h1>Catch All</h1>
      <p>This is a catch all page added to the APP router</p>
    </div>
  )
}
