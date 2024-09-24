import Link from "next/link";
import { fetchGithubStars } from "../shared/fetch-github-stars";

export async function getServerSideProps() {
  const stars = await fetchGithubStars();
  return {
    props: {
      stars,
    },
  };
}

export default function IndexPage({ stars }) {
  return (
    <>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact-stars">How about preact?</Link>
    </>
  );
}
