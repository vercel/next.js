import App from '../components/app'
import Header from '../components/header'

export default () => (
  <App>
    <Header />
    <article>
      <h1>The Idea Behind This Example</h1>
      <p>
        <a href="https://github.com/nearform/graphql-hooks">GraphQL Hooks</a> is
        a library from NearForm that intends to be a minimal hooks-first GraphQL
        client. Providing it in a way familiar to Apollo users.
      </p>

      <p>
        This started life as a copy of the `with-apollo` example. We then
        stripped out Apollo and replaced it with `graphql-hooks`. This was
        mostly as an exercise in ensuring basic functionality could be achieved
        in a similar way to Apollo.
      </p>

      <p>
        You'll see this shares the same{' '}
        <a href="https://www.graph.cool">graph.cool</a> backend as the Apollo
        example, this is so you can compare the two side by side. The app itself
        should also look identical.
      </p>
    </article>
  </App>
)
