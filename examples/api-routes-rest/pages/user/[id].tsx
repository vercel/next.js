import type { User } from "../../interfaces";
import { useRouter } from "next/router";
import useSwr from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function UserPage() {
  const { query } = useRouter();
  const { data, error, isLoading } = useSwr<User>(
    query.id ? `/api/user/${query.id}` : null,
    fetcher,
  );

  if (error) return <div>Failed to load user</div>;
  if (isLoading) return <div>Loading...</div>;
  if (!data) return null;

  return <div>{data.name}</div>;
}
