const EXTERNAL_DATA_URL = 'https://jsonplaceholder.typicode.com/posts'

const createSitemap = (posts) => `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${posts
          .map(({ id }) => {
            return `
                <url>
                    <loc>${`${EXTERNAL_DATA_URL}/${id}`}</loc>
                </url>
            `
          })
          .join('')}
    </urlset>
    `
export async function getServerSideProps({ res }) {
  const request = await fetch(EXTERNAL_DATA_URL)
  const posts = await request.json()

  res.setHeader('Content-Type', 'text/xml')
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=1200, stale-while-revalidate=600'
  )
  res.write(createSitemap(posts))
  res.end()

  return {
    props: {},
  }
}

export default function Sitemap() {
  return null
}
