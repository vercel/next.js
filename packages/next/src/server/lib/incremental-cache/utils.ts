export const getDerivedTags = (tags: string[]): string[] => {
  const derivedTags: string[] = ['/']

  for (const tag of tags || []) {
    if (tag.startsWith('/')) {
      const pathnameParts = tag.split('/')

      // we automatically add the current path segments as tags
      // for revalidatePath handling
      for (let i = 1; i < pathnameParts.length + 1; i++) {
        const curPathname = pathnameParts.slice(0, i).join('/')

        if (curPathname) {
          derivedTags.push(curPathname)

          if (!derivedTags.includes(curPathname)) {
            derivedTags.push(curPathname)
          }
        }
      }
    } else if (!derivedTags.includes(tag)) {
      derivedTags.push(tag)
    }
  }
  return derivedTags
}
