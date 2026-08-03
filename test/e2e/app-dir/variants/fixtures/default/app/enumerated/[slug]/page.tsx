import { locale, theme } from '../../../variants'

export async function generateStaticParams() {
  return [{ slug: 'a' }]
}

// Declared for the route rather than per params row, so it applies to `a` here,
// to any param prerendered on demand, and to a fallback shell.
export async function generateStaticVariants() {
  return [
    [
      [theme, 'light'],
      [locale, 'en'],
    ],
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
  ]
}

// The param is awaited at the top level, with no boundary above it, so a
// fallback shell for this route can contain nothing and comes out empty. That
// is what makes a param nobody enumerated fall through to being prerendered on
// demand, which is the case this route exists to cover. See `shell/[slug]` for
// the opposite arrangement.
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      <p id="theme">{await theme()}</p>
      <p id="locale">{await locale()}</p>
      <p id="slug">{slug}</p>
    </>
  )
}
