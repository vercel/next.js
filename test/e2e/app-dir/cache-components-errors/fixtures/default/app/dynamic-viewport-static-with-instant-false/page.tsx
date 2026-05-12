export const unstable_instant = false

export async function generateViewport() {
  await new Promise((r) => setTimeout(r, 0))
  return { themeColor: 'black' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page is static except for `generateViewport`. It opts into a fully
        dynamic, blocking route via `export const unstable_instant = false`,
        which is a documented mitigation for dynamic `generateViewport`. With
        that opt-in, the dynamic viewport should not error the build and should
        not show a redbox in dev. This is the symmetric counterpart to the
        Suspense-above-body opt-in.
      </p>
      <span id="sentinel">sentinel</span>
    </>
  )
}
