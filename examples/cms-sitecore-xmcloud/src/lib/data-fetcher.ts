import {
  AxiosDataFetcher,
  AxiosResponse,
} from "@sitecore-jss/sitecore-jss-nextjs";

/**
 * Implements a data fetcher using Axios - replace with your favorite
 * SSR-capable HTTP or fetch library if you like. See HttpDataFetcher<T> type
 * in sitecore-jss library for implementation details/notes.
 * @param {string} url The URL to request; may include query string
 * @param {unknown} data Optional data to POST with the request.
 */
export function dataFetcher<ResponseType>(
  url: string,
  data?: unknown,
): Promise<AxiosResponse<ResponseType>> {
  return new AxiosDataFetcher().fetch<ResponseType>(url, data);
}
