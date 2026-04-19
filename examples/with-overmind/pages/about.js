import Header from "../components/Header";
import { createOvermindSSR } from "overmind";
import { config } from "../overmind";

export async function getStaticProps() {
  // If we want to produce some mutations we do so by instantiating
  // an Overmind SSR instance, do whatever datafetching is needed and
  // change the state directly. We return the mutations performed with
  // "hydrate"
  const overmind = createOvermindSSR(config);

  overmind.state.page = "About";

  return {
    props: { mutations: overmind.hydrate() },
  };
}

export default function AboutPage() {
  return (
    <div>
      <Header />
    </div>
  );
}
