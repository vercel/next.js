import { useRouter } from 'next/router'
import Error from 'next/error'

function loadArticle() {
  return {
    content: [
      {
        type: 'header',
        content: 'My awesome article',
      },
      {
        type: 'paragraph',
        content:
          'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Aenean commodo ligula eget dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem. Nulla consequat massa quis enim. Donec pede justo, fringilla vel, aliquet nec, vulputate eget, arcu. In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt. Cras dapibus. Vivamus elementum semper nisi. Aenean vulputate eleifend.',
      },
    ],
  }
}

const Page = ({ path, article }) => {
  const router = useRouter()

  if (router.isFallback) {
    return <div>Loading...</div>
  }

  if (!article.content) {
    return <Error statusCode={404} />
  }

  const [header, ...body] = article.content

  return (
    <article>
      <header>{header.content}</header>
      <small>path: {path.join('/')}</small>
      <main>
        {body.map(({ content }) => (
          <p>{content}</p>
        ))}
      </main>
    </article>
  )
}

export default Page

export async function getStaticProps({ params }) {
  const { path } = params
  const article = loadArticle(path)

  return {
    props: {
      article,
      path,
    },
  }
}

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  }
}
