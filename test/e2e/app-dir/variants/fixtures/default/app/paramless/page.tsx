import { locale, theme } from '../../variants'

// No dynamic segments, so this route builds no static paths at all. The
// combinations still have to be prerendered against, which is what makes the
// variants read below possible: without them there is no value to bake and the
// read has no boundary to postpone into.
export async function generateStaticVariants() {
  return [
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
    [
      [theme, 'light'],
      [locale, 'en'],
    ],
  ]
}

export default async function Page() {
  return (
    <>
      <p id="theme">{await theme()}</p>
      <p id="locale">{await locale()}</p>
    </>
  )
}
