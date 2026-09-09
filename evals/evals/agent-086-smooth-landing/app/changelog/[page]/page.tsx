import Link from 'next/link'

const NOTES = [
  'Fixed a race where two rapid checkout clicks could open duplicate sheets.',
  'The payment sheet now traps focus correctly while open.',
  'Reduced client bundle size by lazily loading the 3DS challenge frame.',
  'Webhook signatures now include a timestamp to reject replayed events.',
  'Declined-card errors carry the issuer decline code when available.',
  'Session renewal no longer races a checkout opened in the same tick.',
  'The tenant resolver cache is dropped after long idle periods.',
  'Refund events now fire for partial refunds issued from the dashboard.',
  'Improved keyboard navigation across the saved payment methods list.',
  'The sandbox bank simulator gained a configurable latency mode.',
  'Correlation ids are attached to every request for supportability.',
  'Currency formatting respects the checkout locale override.',
]

function releasesFor(pageNum: number) {
  return NOTES.map((note, i) => {
    const patch = (pageNum - 1) * NOTES.length + i
    return {
      version: `v4.${240 - patch}.0`,
      date: `2026-0${((pageNum + i) % 8) + 1}-1${i % 10}`,
      note,
    }
  })
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ page: string }>
}) {
  const { page } = await params
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1)
  const releases = releasesFor(pageNum)

  return (
    <>
      <h1 data-testid="changelog-title">Changelog — Page {pageNum}</h1>
      <p>Release notes for the Acme SDK, newest first.</p>

      {releases.map((release) => (
        <article className="release" key={release.version}>
          <h2>{release.version}</h2>
          <p>
            <time>{release.date}</time>
          </p>
          <p>{release.note}</p>
        </article>
      ))}

      <nav className="pager">
        {pageNum > 1 ? (
          <Link
            href={`/changelog/${pageNum - 1}`}
            scroll={false}
            data-testid="prev-page"
          >
            ← Newer releases
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/changelog/${pageNum + 1}`}
          scroll={false}
          data-testid="next-page"
        >
          Older releases →
        </Link>
      </nav>

      <section className="support-note">
        <h2>Support policy</h2>
        <p>
          The latest two major versions receive bug fixes; the latest major
          also receives new features. Security fixes are backported one major
          further. Versions older than that continue to work but are frozen,
          and the dashboard flags accounts still pinned to them.
        </p>
        <p>
          Deprecations are announced here at least two minor releases before
          removal, and each deprecation entry links a codemod when one exists.
        </p>
      </section>
    </>
  )
}
