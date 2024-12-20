"use client"
import { useState, useEffect } from 'react';

function GitHubInfo({ username }: { username: string }) {
  const [stars, setStars] = useState<number | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);

  useEffect(() => {
    async function fetchGitHubData() {
      const response = await fetch(`https://api.github.com/users/${username}`);
      const data = await response.json();

      const starsResponse = await fetch(data.repos_url);
      const repos = await starsResponse.json();

      const totalStars = repos.reduce((acc: number, repo: { stargazers_count: number }) => acc + repo.stargazers_count, 0);
      setStars(totalStars);
      setFollowers(data.followers);
    }

    fetchGitHubData();
  }, [username]);

  if (stars === null || followers === null) {
    return <p className='prose prose-neutral dark:prose-invert text-sm'>Loading...</p>;
  }

  return (
    <p className='prose prose-neutral dark:prose-invert text-sm'>
      Stars: {stars}, Followers: {followers}
    </p>
  );
}

export default GitHubInfo;
