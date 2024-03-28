"use client"

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/form"
import { useSetSearchParams } from "@/hooks/use-set-search-params"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"

import * as z from "zod"
import { Input } from "./input"

const searchSchema = z.object({
  search: z.string().optional().default(""),
})

type FormData = z.infer<typeof searchSchema>

interface ISearchInput {
  showFilter?: boolean
  onSubmitCallback?: () => void
  placeholder?: string
}
export const SearchInput = ({
  placeholder = "Search this Index...",
  showFilter = true,
  onSubmitCallback,
}: ISearchInput) => {
  const router = useRouter()

  const [isPending, startTransition] = useTransition()

  const setSearchParam = useSetSearchParams()
  const searchParams = useSearchParams()
  const query = searchParams?.get("query") ?? ""

  const form = useForm<FormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      search: query ?? "",
    },
  })

  function onSubmit(values: FormData) {
    // Do something with the form values.
    // ✅ This will be type-safe and validated.
    startTransition(() => {
      setSearchParam("query", values.search)
      setSearchParam("offset", "0")
      router.refresh()
    })
  }

  return (
    <div className="w-full flex gap-2 items-center">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <FormField
            control={form.control}
            name="search"
            render={({ field }) => (
              <FormItem className="relative">
                <FormControl>
                  <div className="relative w-full flex items-center">
                    <Input
                      {...field}
                      placeholder={placeholder}
                      className="pl-10"
                    />
                    <div className="absolute left-4 text-muted-foreground">
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin " />
                      ) : (
                        <Search className="h-4 w-4 " />
                      )}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </div>
  )
}
