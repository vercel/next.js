import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="pages-page">hello from pages/index</p>
      {/*
        Prefetching this link evaluates the client router filter against
        `/fr/legacy`, which matches the French-only redirect.
      */}
      <Link id="fr-legacy-link" href="/legacy" locale="fr">
        legacy (fr)
      </Link>
      <Link id="en-legacy-link" href="/legacy">
        legacy (en)
      </Link>
    </>
  )
}
