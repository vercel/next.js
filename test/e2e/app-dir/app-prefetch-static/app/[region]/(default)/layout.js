export const regions = ['SE', 'DE']

export default async function Layout({ children, params }) {
  return children
}

export function generateStaticParams() {
  return regions.map((region) => ({
    region,
  }))
}

export const dynamicParams = false
