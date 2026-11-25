export const instant = { level: 'experimental-error' }

export default async function Page() {
  await loadOuter()
  return (
    <main>
      <p>
        This page awaits a couple blocking (dynamic) things in sequence. We
        should point to the first one as the cause.
      </p>
    </main>
  )
}

async function loadOuter() {
  await new Promise((resolve) => setTimeout(resolve)) // 1 (correct)
  await loadInner()
}

async function loadInner() {
  await new Promise((resolve) => setTimeout(resolve)) // 2 (incorrect)
  await new Promise((resolve) => setTimeout(resolve)) // 3 (incorrect)
}
