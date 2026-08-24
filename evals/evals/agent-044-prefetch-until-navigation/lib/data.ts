const projects: Record<
  string,
  { title: string; description: string; activity: string[] }
> = {
  acme: {
    title: 'Acme Storefront',
    description: 'Commerce storefront and checkout.',
    activity: ['Production deployment', 'Checkout updated', 'Domain verified'],
  },
  orbit: {
    title: 'Orbit Analytics',
    description: 'Product analytics and reporting.',
    activity: ['Report published', 'Data source added', 'Team invited'],
  },
}

export async function getProjectTitle(slug: string) {
  'use cache'
  return projects[slug]?.title ?? 'Unknown project'
}

export async function getProjectDetails(slug: string) {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 800))
  return (
    projects[slug] ?? {
      title: 'Unknown project',
      description: 'This project could not be found.',
      activity: [],
    }
  )
}
