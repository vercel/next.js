import type { InferGetStaticPropsType } from "next";
import type { Repository } from "../github";
import createFetch from "@vercel/fetch";

export async function getStaticProps() {
  const fetch = createFetch();
  const res = await fetch("https://api.github.com/repos/vercel/next.js");
  const repo = (await res.json()) as Repository;

  return { props: { stars: repo.stargazers_count } };
}

export default function HomePage({
  stars,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <p>Next.js has {stars} ⭐️</p>
    </div>
  );
}
