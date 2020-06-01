import ArticlePreview from 'components/article'
import ArticleCard from 'components/article-card'
import Layout from 'components/layout'
import Giphy from 'components/giphy'
import Pagination from 'components/pagination'
import SideBar from 'components/sidebar'
import { connect } from 'libs/db'
import Article from 'models/article'
import Category from 'models/category'

const CategoryPage = (props) => (
  <Layout
    categories={props.categories}
    title={props.category?.name ?? 'Not Found'}
  >
    <div className="row mb-2">
      {props.latest.map((article) => (
        <ArticleCard key={article._id} {...article} />
      ))}
    </div>
    <main className="container">
      <div className="row">
        {props.articles.length ? (
          <div className="col-md-8 blog-main">
            {props.articles.map((article) => (
              <ArticlePreview key={article._id} article={article} preview />
            ))}
            <Pagination {...props.pagination} />
          </div>
        ) : (
          <Giphy
            src="https://giphy.com/embed/eIV8AvO3EC3xhscTIW"
            statusCode={props.statusCode}
            statusText={props.statusText}
          />
        )}
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
  const category = categories.find((category) => category.slug === slug)
  const archives = await Article.aggregateArchive(category._id)

  if (!category) {
    context.res.statusCode = 404
  } else {
    query.category = category
  }

  const latest = await Article.findLatest(query)
  const { docs: articles, ...pagination } = await Article.paginate(query, {
    populate: ['category'],
    page,
    limit,
    sort,
  })

  return {
    props: {
      category: query.category ? query.category.toJSON() : null,
      categories: categories.map((category) => category.toJSON()),
      articles: articles.map((article) => article.toJSON()),
      latest: latest.map((article) => article.toJSON()),
      pagination,
      statusCode: query.category ? 204 : 404,
      statusText: query.category ? 'No content' : 'Not found',
      archives,
    },
  }
}

export default CategoryPage
