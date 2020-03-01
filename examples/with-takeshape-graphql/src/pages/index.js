import Error from 'next/error'
import Link from 'next/link'
import cn from 'classnames'
import { getImageUrl } from 'takeshape-routing'
import { graphqlFetch } from '../lib/takeshape-api'
import PostList from '../components/post-list'
import baseTheme from '../base.module.css'
import theme from './homepage.module.css'

export const homePageQuery = `
	query {
	  page: getHomepage {
	    title
	    hero {
	      image {
	        path
	      }
	      featuredPost {
	      	_id
	        title
	        slug
	        author {
	          name
	          slug
	        }
	      }
	    }
	  }
	  posts: getPostList {
	    total
	    items {
	    	_id
	      title
	      slug
	      _enabledAt
	      deck
	      featureImage {
	        path
	      }
	    }
	  }
	}
`

export async function getStaticProps() {
  const data = await graphqlFetch({ query: homePageQuery })

  return {
    props: {
      hero: data.page.hero,
      posts: data.posts.items.slice(0, 3),
    },
  }
}

export default function Home({ hero, posts }) {
  if (!hero || !posts) {
    /* We return Next's built in Error handler instead of
		developing a custom component ourselves. */
    return <Error statusCode="500" />
  }

  const heroImageOptions = {
    w: 1000,
    fit: 'crop',
  }
  const heroImageSrc = getImageUrl(hero.image.path, heroImageOptions)

  return (
    <>
      <div
        className={theme.hero}
        style={{ backgroundImage: `url(${heroImageSrc})` }}
      >
        <div className={cn(theme.heroContainer, baseTheme.container)}>
          {hero.featuredPost && (
            <div className={theme.feature}>
              <Link
                href="/posts/[slug]"
                as={`/posts/${hero.featuredPost.slug}`}
              >
                <a>
                  <p>Featured Post</p>

                  <h2>{hero.featuredPost.title}</h2>
                  <p>by {hero.featuredPost.author.name}</p>
                </a>
              </Link>
            </div>
          )}
        </div>
      </div>

      <section>
        <header className={baseTheme.header}>
          <h2>Recent Posts</h2>
        </header>

        <PostList posts={posts} />

        <div className={baseTheme.buttonContainer}>
          <Link href="/posts">
            <a className={baseTheme.button}>View all posts</a>
          </Link>
        </div>
      </section>
    </>
  )
}
