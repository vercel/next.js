import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = {
  searchParams: Promise<{ page?: string }>
}

export default async function Home({ searchParams }: Props) {
  const { page } = await searchParams
  const currentPage = page ? parseInt(page, 10) : 1

  // Throw notFound if page is higher than 10 (programmatic notFound)
  if (currentPage > 10) {
    notFound()
  }

  return (
    <main>
      <h1 id="home-title">Home Page</h1>
      <p id="current-page">Current page: {currentPage}</p>

      <nav>
        <ul>
          {/* Links to pages that trigger programmatic notFound() */}
          {Array.from({ length: 15 }, (_, i) => i + 1).map((pageNum) => (
            <li key={pageNum}>
              <Link href={`/?page=${pageNum}`} id={`link-to-page-${pageNum}`}>
                Page {pageNum}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  )
}
