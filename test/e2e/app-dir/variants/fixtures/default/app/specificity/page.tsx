import { Suspense } from 'react'

import { locale, theme } from '../../variants'

// Two combinations whose key sets contain one another, which is the only shape
// that puts a page in more than one group. Every other route of this fixture
// declares one key set and therefore one group.
//
// `[theme]` is a subset of `[theme, locale]`, so the ambiguity check permits
// the pair: the larger combination is the more specific match rather than a
// rival to it. A request that resolves `theme=dark` and `locale=en` matches
// both groups, and the more specific one has to win. A request that resolves
// `theme=dark` with any other locale matches only the smaller group, which
// leaves `locale` a dynamic hole.
export async function unstable_generateStaticVariants() {
  return [
    [[theme, 'dark']],
    [
      [theme, 'dark'],
      [locale, 'en'],
    ],
  ]
}

// Both variants sit behind a boundary, so the prerender of the smaller group
// has a shell to serve while `locale` resolves.
//
// A fallback carries the same id as the value it stands in for, so one
// assertion reads either. A prerender that bakes a variant renders its value,
// and one that leaves the variant a hole renders `pending`, which is what tells
// the prerenders of this route apart.
export default async function Page() {
  return (
    <>
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="locale">pending</p>}>
        <p id="locale">{locale()}</p>
      </Suspense>
    </>
  )
}
