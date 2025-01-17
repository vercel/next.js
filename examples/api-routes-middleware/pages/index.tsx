import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.text());

export default function Index() {
  const { data, error, isLoading } = useSWR<string>("/api/cookies", fetcher);

  if (error) return <div>Failed to load</div>;
  if (isLoading) return <div>Loading...</div>;
  if (!data) return null;

  return <div>{`Cookie from response: "${data}"`}</div>;
}
