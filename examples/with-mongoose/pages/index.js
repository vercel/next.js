import Article from 'components/article'
import ArticleCard from 'components/article-card'
import ArticleFeatured from 'components/article-featured'
import Layout from 'components/layout'
import Pagination from 'components/pagination'
import SideBar from 'components/sidebar'
import { connect } from 'libs/db'
import Category from 'models/category'

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
  await connect()
  const categories = await Category.find()

  return {
    props: {
      categories: categories.map((category) => category.toJSON()),
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
