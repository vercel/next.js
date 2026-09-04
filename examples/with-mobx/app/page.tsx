import Page from "../components/Page/index";

export default async function Home() {
  const initialState = { lastUpdate: Date.now() };

  return <Page title="Index Page" linkTo="/other" initialState={initialState} />;
}
