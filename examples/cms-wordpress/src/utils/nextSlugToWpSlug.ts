export const nextSlugToWpSlug = (nextSlug: string) =>
  nextSlug && Array.isArray(nextSlug) ? nextSlug.join("/") : (nextSlug ?? "/");
