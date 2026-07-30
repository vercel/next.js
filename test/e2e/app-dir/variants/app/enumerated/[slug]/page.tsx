import { withVariants } from 'next/variants'

import { locale, theme } from '../../../variants'

export async function generateStaticParams() {
  return [
    withVariants({ slug: 'a' }, [
      [theme, 'light'],
      [locale, 'en'],
    ]),
    withVariants({ slug: 'a' }, [
      [theme, 'dark'],
      [locale, 'en'],
    ]),
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
