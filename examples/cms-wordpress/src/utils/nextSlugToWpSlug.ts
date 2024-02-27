// Determines the slug to fetch based on the given slug array. If the slug is an array, it is joined with '/' as separator.
// If the slug is not an array, '/' is returned.
export const nextSlugToWpSlug = (nextSlug: string) =>
  nextSlug && Array.isArray(nextSlug) ? nextSlug.join("/") : nextSlug ?? "/";
