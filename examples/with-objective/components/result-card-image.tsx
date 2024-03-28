import Image from "next/image"

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
    // First, try to find an image URL at the current level
    for (let key in obj) {
        if (obj[key] && typeof obj[key] === "string") {
            const isImage = await fetchIfImageIsUrl(obj[key])
            if (isImage) {
                return obj[key]
            }
        }
    }

    // If no image URL is found, then recursively check nested objects
    for (let key in obj) {
        if (typeof obj[key] === "object") {
            const imageUrl = await traverseObjectForImageUrl(obj[key])
            if (imageUrl) {
                return imageUrl
            }
        }
    }

    // If no image URL is found at all, return null
    return null
}


export const ResultCardImage = async ({ object }: { object: any }) => {
    const image = await traverseObjectForImageUrl(object)

    if (!image) return null
    return (
        <div className="relative h-48">
            <Image fill src={image} alt="Image" className="object-contain h-full w-full" />
        </div>
    )
}