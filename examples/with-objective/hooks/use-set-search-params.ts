"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

export const useSetSearchParams = () => {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams?.toString())

  const setSearchParam = useCallback(
    (
      key: string,
      value: string,
      refresh: boolean | undefined = false,
      scroll: boolean | undefined = false
    ) => {
      params.set(key, value)
      router.push(`${pathname}?${params.toString()}`, { scroll })

      if (refresh) {
        router.refresh()
      }
    },
    [params]
  )

  return setSearchParam
}

export const useAppendSearchParams = () => {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams?.toString())

  const appendSearchParams = useCallback(
    (
      key: string,
      value: string,
      refresh: boolean | undefined = false,
      scroll: boolean | undefined = false
    ) => {
      params.append(key, value)
      router.replace(`${pathname}?${params.toString()}`, { scroll })

      if (refresh) {
        router.refresh()
      }
    },
    [params]
  )

  return appendSearchParams
}

export const useDeleteSearchParams = () => {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams?.toString())

  const removeValue = (params: any, key: string, valueToRemove: any) => {
    const values = params.getAll(key)
    if (values.length) {
      params.delete(key)
      for (const value of values) {
        // BEWARE, remember the values will have been
        // covnerted to string
        if (value !== valueToRemove) {
          params.append(key, value)
        }
      }
    }
    return params // For chaining if desired
  }

  const deleteSearchParams = useCallback(
    (
      key: string,
      value: string,
      refresh: boolean | undefined = false,
      scroll: boolean | undefined = false
    ) => {
      const removedParams = removeValue(params, key, value)
      // params.delete(key, value)
      router.replace(`${pathname}?${removedParams.toString()}`, { scroll })

      if (refresh) {
        router.refresh()
      }
    },
    [params]
  )

  return deleteSearchParams
}
