export const regions = ['SE', 'DE']

export default function Layout({ children }) {
  return children
}

export function generateStaticParams() {
  return regions.map((region) => ({
    region,
  }))
}

export const dynamicParams = false
