// app/page.tsx

import createFetch from "@vercel/fetch";

// Define the interface for the repository data
interface Repository {
  stargazers_count: number;
}

export default async function HomePage() {
  const fetch = createFetch();
  const res = await fetch("https://api.github.com/repos/vercel/next.js");
  const repo = (await res.json()) as Repository;

  return (
    <div>
      <p>Next.js has {repo.stargazers_count} ⭐️</p>
    </div>
  );
}
