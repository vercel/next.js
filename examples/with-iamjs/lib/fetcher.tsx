import useSWR, { SWRConfiguration } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function useFetch<Data = any, Error = any>(
  url: string | null,
  options?: Partial<SWRConfiguration<Data>>
) {
  const { data, error, mutate, isLoading, isValidating } = useSWR<Data, Error>(
    url,
    fetcher,
    options
  );

  return {
    data,
    error,
    loading:
      (isLoading && !error) || (isValidating && !error) || (!data && !error),
    mutate,
  };
}
