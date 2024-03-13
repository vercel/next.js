import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { ErrorMessage } from "./error"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface ISearchIndexParams {
  abortController?: AbortController
  apiHostName: string
  apiKey: string
  indexId: string
  query: string
  filterQuery: string
  debug: boolean
  object_fields: string
  limit?: number
  offset?: number
  view?: string
  body?: any
}

const undefinedFieldsToFilter = ["view", "filterQuery"]

export const searchIndex = async ({
  abortController,
  apiHostName,
  apiKey,
  indexId,
  query,
  filterQuery,
  debug,
  object_fields,
  limit = 10,
  offset = 0,
  view,
  body,
}: ISearchIndexParams) => {
  let addedSearchExtraFields =
    body
      ? object_fields.replace("*", "")
      : object_fields

  const url = new URL(`https://${apiHostName}/v1/indexes/${indexId}/search`)

  let searchParams = new URLSearchParams({
    query: query ?? "",
    limit: limit.toString() ?? "",
    offset: offset.toString(),
    filter_query: filterQuery ?? undefined,
    debug: debug ? "1" : "0",
    view: view ?? "",
  })

  searchParams.forEach((param) => {
    if (undefinedFieldsToFilter.includes(param) && !param) {
      searchParams.delete(param)
    }
  })

  try {
    const res = await fetch(
      `${url}?${searchParams?.toString()}&object_fields=${addedSearchExtraFields}`,
      {
        body: body ? body : undefined,
        method: body ? "POST" : "GET",
        headers: {
          Apikey: apiKey,
          "ngrok-skip-browser-warning": "true",
          "Access-Control-Allow-Origin": "*",
          cache: "no-store",
        },
        signal: abortController?.signal,
      }
    )

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(ErrorMessage.INVALID_HOSTNAME_OR_KEY)
      } else {
        throw new Error(ErrorMessage.SEARCH)
      }
    }
    return res.json()
  } catch (e) {
    console.log(e)
  }
}