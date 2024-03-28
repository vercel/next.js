import { SearchInput } from "@/components/search-input"
import { Shell } from "@/components/shell"
import { Loader2 } from "lucide-react"

export default async function Loading() {
    return (
        <Shell className="max-w-7xl min-h-screen">
            <SearchInput />
            <div className="mt-24 flex justify-center items-center">
                <Loader2 className="h-24 w-24 animate-spin text-muted" />
            </div>
        </Shell>
    )
}