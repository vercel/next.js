import ArticleComponent from 'components/article'
import Layout from 'components/layout'
import SideBar from 'components/sidebar'
import { connect } from 'libs/db'
import Article from 'models/article'
import Category from 'models/category'
import Comment from 'components/comment'

const ArticlePage = ({ article, categories }) => (
  <Layout categories={categories} title={article.title}>
    <main className="container">
      <div className="row">
        <div className="col-md-8 blog-main">
          <ArticleComponent article={article} />
          <div className="row">
            <div className="col-12">
              <h3 className="lead font-weight-bold mb-4">
                Comments ({article.comments.length})
              </h3>
              <hr />
              <ul className="list-unstyled">
                {article.comments.map((comment) => (
                  <Comment key={comment.id} comment={comment} />
                ))}
              </ul>
            </div>
          </div>
        </div>
        <SideBar />
      </div>
    </main>
  </Layout>
)

export async function getStaticPaths() {
  await connect()
  const articles = await Article.find(
    {},
    { slug: true },
    { sort: '-createdAt' }
  ).limit(25)
  const paths = articles.map((article) => ({ params: { slug: article.slug } }))

  return {
    paths,
    fallback: true,
  }
}

export async function getStaticProps(context) {
  await connect()
  const slug = context.params.slug
  const categories = await Category.find()
  const article = await Article.findOne().bySlug(slug).populate('category')

  return {
    props: {
      categories: categories.map((category) => category.toJSON()),
      article: article.toJSON(),
    },
  }
}

export default ArticlePage
