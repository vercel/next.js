import ArticlePreview from 'components/article'
import ArticleCard from 'components/article-card'
import ArticleFeatured from 'components/article-featured'
import Layout from 'components/layout'
import Pagination from 'components/pagination'
import SideBar from 'components/sidebar'
import { connect } from 'libs/db'
import { isDate } from 'libs/is-date'
import Article from 'models/article'
import Category from 'models/category'

const IndexPage = (props) => (
  <Layout categories={props.categories} title="Home">
    {props.featured && (
      <ArticleFeatured
        slug={props.featured.slug}
        title={props.featured.title}
        abstract={props.featured.abstract}
      />
    )}
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
  const { page = 1, limit = 5, sort = '-createdAt', from, to } = context.query
  const query = {}
  const categories = await Category.find()
  const archives = await Article.aggregateArchive()

  const latest = await Article.findLatest(query)
  const featured = await Article.findOneFeatured(query)

  if (isDate(from) && isDate(to)) {
    query.createdAt = { $gt: new Date(from), $lt: new Date(to) }
  }
  const { docs: articles, ...pagination } = await Article.paginate(query, {
    populate: ['category'],
    page,
    limit,
    sort,
  })
  if (articles.length === 0) {
    context.res.writeHead(302, { Location: '/article/editor' })
    context.res.end()
  }

  return {
    props: {
      categories: categories.map((category) => category.toJSON()),
      articles: articles.map((article) => article.toJSON()),
      latest: latest.map((article) => article.toJSON()),
      featured: featured && featured.toJSON(),
      pagination,
      archives,
    },
  }
}

export default IndexPage
