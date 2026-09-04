import { Suspense } from 'react'

import { theme } from '../../../variants'

// One row, because Cache Components requires at least one and because it makes
// this param prerenderable, which is what allows a shell to be upgraded. The
// test asks for a value the list does not name, so its request is served a
// fallback shell and triggers the upgrade.
export function generateStaticParams() {
  return [{ one: 'b' }]
}

export async function unstable_generateStaticVariants() {
  return [[[theme, 'dark']], [[theme, 'light']]]
}

// Each read sits behind its own boundary. A declared combination resolves its
// variant at once, so the theme lands in the shell, while the param stays a
// hole until a request supplies it. That is what makes the upgraded shells of
// two combinations differ.
export default async function Page({
  params,
}: {
  params: Promise<{ one: string }>
}) {
  return (
    <>
      <Suspense fallback={<p id="theme">pending</p>}>
        <p id="theme">{theme()}</p>
      </Suspense>
      <Suspense fallback={<p id="one">pending</p>}>
        <One params={params} />
      </Suspense>
    </>
  )
}

async function One({ params }: { params: Promise<{ one: string }> }) {
  const { one } = await params

  return <p id="one">{one}</p>
}
