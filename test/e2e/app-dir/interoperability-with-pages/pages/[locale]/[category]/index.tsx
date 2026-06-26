import type { GetStaticPropsContext } from 'next'

const categories = ['test-category']

export default function CategoryPage({ category }: { category: string }) {
  return (
    <main id="pages-category-page">
      <h1>Pages Router Category: {category}</h1>
    </main>
  )
}

export function getStaticProps({ params }: GetStaticPropsContext) {
  return {
    props: {
      category: params?.category,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: categories.map((category) => ({
      params: { category, locale: 'en' },
    })),
    // Allow arbitrary category segments such as `/en/about` to resolve to this
    // dynamic route instead of returning a 404 in production.
    fallback: 'blocking',
  }
}
