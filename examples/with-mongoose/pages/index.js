import ArticlePreview from 'components/article'
import ArticleCard from 'components/article-card'
import ArticleFeatured from 'components/article-featured'
import Layout from 'components/layout'
import Pagination from 'components/pagination'
import SideBar from 'components/sidebar'
import { connect } from 'libs/db'
import Article from 'models/article'
import Category from 'models/category'

const IndexPage = (props) => (
  <Layout categories={props.categories} title="Home">
    <ArticleFeatured
      slug={props.featured.slug}
      title={props.featured.title}
      abstract={props.featured.abstract}
    />
    <div className="row mb-2">
      {props.latest.map((article) => (
        <ArticleCard key={article._id} {...article} />
      ))}
    </div>
    <main className="container">
      <div className="row">
        <div className="col-md-8 blog-main">
          {props.articles.map((article) => (
            <ArticlePreview key={article._id} article={article} preview />
          ))}
          <Pagination {...props.pagination} />
        </div>
        <SideBar archives={props.archives} />
      </div>
    </main>
  </Layout>
)

export async function getServerSideProps(context) {
  await connect()
  const { page = 1, limit = 5, sort = '-createdAt', slug } = context.query
  const query = {}
  const categories = await Category.find()
  const archives = await Article.aggregateArchive()

  if (slug) {
    query.category = categories.find((category) => category.slug === slug)
  }

  const featured = await Article.findOneFeatured(query)
  const latest = await Article.findLatest(query)
  const { docs: articles, ...pagination } = await Article.paginate(query, {
    populate: ['category'],
    page,
    limit,
    sort,
  })

  return {
    props: {
      categories: categories.map((category) => category.toJSON()),
      articles: articles.map((article) => article.toJSON()),
      latest: latest.map((article) => article.toJSON()),
      featured: featured.toJSON(),
      pagination,
      archives,
    },
  }
}

export default IndexPage
