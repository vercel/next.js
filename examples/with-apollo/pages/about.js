import App from "../components/App";
import Header from "../components/Header";

const AboutPage = () => (
  <App>
    <Header />
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
        In this simple example, we integrate Apollo seamlessly with{" "}
        <a href="https://github.com/vercel/next.js">Next</a> by calling{" "}
        <a href="https://nextjs.org/docs/basic-features/data-fetching/get-static-props">
          getStaticProps
        </a>{" "}
        at our Page component. This approach lets us opt out of getInitialProps
        and let us use all the niceties provided by{" "}
        <a href="https://github.com/vercel/next.js">Next</a>.
      </p>
      <p>
        On initial page load, while on the server and inside{" "}
        <a href="https://nextjs.org/docs/basic-features/data-fetching/get-static-props">
          getStaticProps
        </a>
        , we fetch the query used to get the list of posts. At the point in
        which the query promise resolves, our Apollo Client store is completely
        initialized. Then we serve the initial HTML with the fetched data and
        hydrate Apollo in the browser.
      </p>
      <p>
        This example relies on <a href="http://graph.cool">graph.cool</a> for
        its GraphQL backend.
      </p>
    </article>
  </App>
);

export default AboutPage;
