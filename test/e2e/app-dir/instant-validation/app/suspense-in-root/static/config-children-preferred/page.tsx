// Children and @other both have config at the same depth (page level).
// Children's config should be preferred as the root cause when the
// error is in @slot (which has no config).
export const unstable_instant = true

export default function Page() {
  return (
    <main>
      <p>Children page — same-depth config, no blocking</p>
    </main>
  )
}
