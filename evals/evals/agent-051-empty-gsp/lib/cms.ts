// In CI and review apps the CMS is empty; locally it usually has entries.
// (Simulated here: this environment behaves like CI.)
export async function fetchDocSlugs(): Promise<{ slug: string }[]> {
  await new Promise((resolve) => setTimeout(resolve, 20))
  return []
}

export async function fetchDoc(slug: string) {
  await new Promise((resolve) => setTimeout(resolve, 20))
  return { slug, title: `Doc: ${slug}`, body: 'Lorem ipsum.' }
}
