const fetchIfImageIsUrl = async (url: string) => {
    try {
        const res = await fetch(url)
        const buff = await res.blob()

        return buff.type.startsWith("image/")
    } catch (e) {
        return false
    }
}
const traverseObjectForImageUrl = async (
    obj: Record<string, any>
): Promise<string | null> => {
    for (let key in obj) {
        if (typeof obj[key] === "object") {
            return traverseObjectForImageUrl(obj[key])
        }
        if (obj[key] && typeof obj[key] === "string") {
            const isImage = await fetchIfImageIsUrl(obj[key])

            if (isImage) {
                return obj[key]
            }
        }
    }
    return null
}


export const ResultCardImage = async ({ object }: { object: any }) => {
    const image = await traverseObjectForImageUrl(object)

    if (!image) return null
    return (
        <div className="relative h-48">
            <img src={image} alt="Image" className="object-contain h-full w-full" />
        </div>
    )
}