import App from '../components/App'
import Header from '../components/Header'

const AboutPage = () => (
  <App>
    <Header pathname="/about" />
    <article>
      <h1>The Idea Behind This Example</h1>
      <p>
        <a href="https://www.apollographql.com/client/">Apollo</a> is a GraphQL
        client that allows you to easily query the exact data you need from a
        GraphQL server. In addition to fetching and mutating data, Apollo
        analyzes your queries and their results to construct a client-side cache
        of your data, which is kept up to date as further queries and mutations
        are run, fetching more results from the server.
      </p>
      <p>
        In this simple example, we integrate Apollo seamlessly with{' '}
        <a href="https://github.com/vercel/next.js">Next</a> by calling{' '}
        <a href="https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation">
          getStaticProps
        </a>{' '}
        at our Page component. This approach lets us opt out of getInitialProps
        and let us use all the niceties provided by{' '}
        <a href="https://github.com/vercel/next.js">Next</a>.
      </p>
      <p>
        On initial page load, while on the server and inside{' '}
        <a href="https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation">
          getStaticProps
        </a>
        , we invoke the Apollo method,{' '}
        <a href="https://www.apollographql.com/docs/react/api/react-ssr/#getdatafromtree">
          getDataFromTree
        </a>
        . This method returns a promise; at the point in which the promise
        resolves, our Apollo Client store is completely initialized. Then we
        serve the received html as string which gives us 100% SSG content.
      </p>
      <p>
        This example relies on <a href="http://graph.cool">graph.cool</a> for
        its GraphQL backend.
      </p>
    </article>
  </App>
)

export default AboutPage
