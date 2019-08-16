import App from "../components/App";
import Header from "../components/Header";

export default () => (
  <App>
    <Header />
    <article>
      <h1>Next + Apollo : The one with Hooks</h1>
      <p>
        This example shows how the old{" "}
        <a href="https://github.com/zeit/next.js/tree/canary/examples/with-apollo">
          Next With Apollo
        </a>{" "}
        example can be migrated to use Hooks instead of Higher Order Components.
      </p>
    </article>
  </App>
);
