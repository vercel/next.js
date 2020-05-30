import dynamic from 'next/dynamic'
import ErrorPage from 'next/error'
import { useRouter } from 'next/router'

import ArticleComponent from 'components/article'
import Giphy from 'components/giphy'
import Layout from 'components/layout'
import SideBar from 'components/sidebar'
import { connect } from 'libs/db'
import Article from 'models/article'
import Category from 'models/category'

const Comments = dynamic(import('components/comments'), {
  ssr: false,
  loading: () => (
    <div className="row">
      <div className="col-12">
        <h3 className="lead font-weight-bold mb-4">Loading comment section</h3>
      </div>
    </div>
  ),
})
const ArticlePage = (props) => {
  const router = useRouter()

  if (!router.isFallback && !props.article)
    return <ErrorPage statusCode={404} />

  return (
    <Layout
      categories={props.categories}
      title={props.article?.title ?? 'Loading'}
    >
      <main className="container">
        <div className="row">
          {router.isFallback ? (
            <Giphy
              src="https://giphy.com/embed/ule4vhcY1xEKQ"
              statusCode={206}
              statusText={'Loading the article'}
            />
          ) : (
            <div className="col-md-8 blog-main">
              <ArticleComponent article={props.article} />
              <Comments />
            </div>
          )}
          <SideBar />
        </div>
      </main>
    </Layout>
  )
}

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
      article: article && article.toJSON(),
    },
  }
}

export default ArticlePage
