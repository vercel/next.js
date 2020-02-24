import React, { Fragment } from 'react'
import Head from 'next/head'
import Error from 'next/error'
import cx from 'classnames'
import TakeShape from '../../providers/takeshape'
import HtmlContent from '../../components/content'
import baseTheme from '../../base.module.css'
import theme from './author.module.css'

export const authorQuery = slug => `
  query {
    authors: getAuthorList(filter: {term: {slug: "${slug}"}}) {
      total
      items {
        _id
        name
        photo {
          path
        }
        biography
        biographyHtml
        authored {
          title
        }
      }
    }
  }
`

export const authorSlugsQuery = `
  query {
    authors: getAuthorList {
      items {
        slug
      }
    }
  }
`

const AuthorPage = ({ data }) => {
  if (!data || data.errors) {
    return <Error statusCode={500} />
  } else if (data.authors.total < 1) {
    return <Error statusCode={404} />
  }
  const { name, photo, biographyHtml } = data.authors.items[0]
  return (
    <Fragment>
      <Head>
        <title key="title">{name} / Author / Shape Blog</title>
        <meta
          key="description"
          name="description"
          content={`${name} is an author on Shape Blog`}
        ></meta>
      </Head>
      <header className={baseTheme.header}>
        <h1>{name}</h1>
      </header>
      <div className={theme.author}>
        <div className={cx(theme.container, baseTheme.container)}>
          <div className={theme.image}>
            <img src={TakeShape.getImageUrl(photo.path, { w: 350 })} alt={''} />
          </div>
          <HtmlContent bodyHtml={biographyHtml} />
        </div>
      </div>
    </Fragment>
  )
}

export async function unstable_getStaticProps({ params }) {
  try {
    const { slug } = params
    const res = await TakeShape.graphql({ query: authorQuery(slug) })
    const json = await res.json()
    if (json.errors) throw json.errors
    const data = json.data
    return {
      props: {
        data,
      },
    }
  } catch (error) {
    console.error(error)
    return error
  }
}

export async function unstable_getStaticPaths() {
  try {
    const res = await TakeShape.graphql({ query: authorSlugsQuery })
    const json = await res.json()
    if (json.errors) throw json.errors
    const data = json.data
    const authors = data.authors.items
    return authors.reduce(
      (pages, author) =>
        pages.concat({
          params: { slug: author.slug },
        }),
      []
    )
  } catch (error) {
    console.error(error)
    return error
  }
}

export default AuthorPage
