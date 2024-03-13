"use client"
import { useSetSearchParams } from "@/hooks/use-set-search-params"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/select"

interface ISearchResultsSelector {
    searchOptions?: string[]
    limit?: string
}
export const SearchResultsSelector = ({
    limit = "12",
    searchOptions = ["12", "24", "36", "48", "60"],
}: ISearchResultsSelector) => {
    const setSearchParams = useSetSearchParams()

    return (
        <Select
            onValueChange={(e) => {
                setSearchParams("limit", e, true)
                setSearchParams("offset", "0", true)
            }}
            defaultValue={limit}
        >
            <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={limit} />
            </SelectTrigger>
            <SelectContent side="top">
                {searchOptions.map((pageSize) => (
                    <SelectItem key={pageSize} value={pageSize}>
                        {pageSize}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
