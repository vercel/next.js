import Page from "../components/Page";

export default function SSR() {
  return <Page title="Index Page" linkTo="/other" />;
}

// The date returned here will be different for every request that hits the page,
// that is because the page becomes a serverless function instead of being statically
// exported when you use `getServerSideProps` or `getInitialProps`
export function getServerSideProps() {
  return { props: { initialState: { lastUpdate: Date.now() } } };
}
