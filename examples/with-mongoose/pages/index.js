import Article from 'components/article'
import ArticleCard from 'components/article-card'
import ArticleFeatured from 'components/article-featured'
import Layout from 'components/layout'
import Pagination from 'components/pagination'
import SideBar from 'components/sidebar'

const IndexPage = ({ categories, featured, articles }) => (
  <Layout categories={categories} title="Home">
    <ArticleFeatured
      slug={featured.slug}
      title={featured.title}
      abstract={featured.abstract}
    />
    <div className="row mb-2">
      {articles.map((article) => (
        <ArticleCard key={article.id} {...article} />
      ))}
    </div>
    <main className="container">
      <div className="row">
        <div className="col-md-8 blog-main">
          {articles.map((article) => (
            <Article key={article.id} article={article} preview />
          ))}
          <Pagination />
        </div>
        <SideBar />
      </div>
    </main>
  </Layout>
)

export async function getServerSideProps(context) {
  return {
    props: {
      categories: [
        {
          id: 'e0edde4d-3a46-48e1-840d-23695fabbc08',
          name: 'World',
          slug: 'world',
        },
        {
          id: '098bd7b9-80d8-4b1a-87b7-898e50201747',
          name: 'U.S.',
          slug: 'u-s',
        },
        {
          id: '27881b6e-53fa-47f1-8968-277bc102d852',
          name: 'Technology',
          slug: 'technology',
        },
        {
          id: 'f0eb2cea-8476-407e-b521-069626bebe74',
          name: 'Design',
          slug: 'design',
        },
        {
          id: '864d3e00-7b26-449d-b8b4-8112e5ec1299',
          name: 'Culture',
          slug: 'culture',
        },
        {
          id: 'fc144c69-baad-4d2e-99f3-1531ed78d947',
          name: 'Business',
          slug: 'business',
        },
        {
          id: 'd42dc9b8-238f-4fd8-a472-84b6be7d9325',
          name: 'Politics',
          slug: 'politics',
        },
        {
          id: '0460c10d-4ebc-47de-acbb-623849785a1c',
          name: 'Opinion',
          slug: 'opinion',
        },
        {
          id: '7770b8dd-a3d1-4789-862a-48b579382842',
          name: 'Science',
          slug: 'science',
        },
        {
          id: '9a4d2e4c-3052-490e-8dfc-4d451363d4c7',
          name: 'Health',
          slug: 'health',
        },
        {
          id: '351075b5-2368-471c-ad91-85b4a81143e6',
          name: 'Style',
          slug: 'style',
        },
        {
          id: '1c523b13-ec25-445a-9d75-b635b5d5e886',
          name: 'Travel',
          slug: 'travel',
        },
      ],
      articles: [
        {
          id: 'f3ab77d6-b8a9-47f1-a954-76a877698d1b',
          slug: 'featured-post',
          title: 'Featured post',
          abstract:
            'This is a wider card with supporting text below as a natural lead-in to additional content.',
          category: {
            id: 'e0edde4d-3a46-48e1-840d-23695fabbc08',
            name: 'World',
            slug: 'world',
          },
          createdAt: new Date(2019, 9, 12).toISOString(),
        },
        {
          id: 'ec9901ae-e4d9-480a-9fef-049eab410f7c',
          slug: 'post-title',
          title: 'Post title',
          abstract:
            'This is a wider card with supporting text below as a natural lead-in to additional content.',
          category: {
            id: 'f0eb2cea-8476-407e-b521-069626bebe74',
            name: 'Design',
            slug: 'design',
          },
          createdAt: new Date(2019, 9, 11).toISOString(),
        },
      ],
      featured: {
        slug: 'title-of-a-longer-featured-blog-post',
        title: 'Title of a longer featured blog post',
        abstract:
          'Multiple lines of text that form the lede, informing new readers quickly and efficiently about what’s most interesting in this post’s contents.',
      },
    },
  }
}

export default IndexPage
