

export function fixUrl(url) {
    if(url.startsWith("redis://") && !url.startsWith("redis://:")) {
        return url.replace("redis://", "redis://:")
    }
    if(url.startsWith("rediss://") && !url.startsWith("rediss://:")) {
        return url.replace("rediss://", "rediss://:")
    }
    return url;
}