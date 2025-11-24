import useSWR from "swr";

export const fetcher = (url) => fetch(url).then((r) => r.json());

export function useUser() {
  const { data, mutate, isLoading } = useSWR("/api/user", fetcher);
  // if data is not defined, the query has not completed
  const loading = isLoading || !data;
  const user = data?.user;
  return [user, { mutate, loading }];
}
