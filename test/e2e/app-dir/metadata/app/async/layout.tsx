export default function layout({ children }) {
  return children
}

export async function generateMetadata() {
  return {
    keywords: 'parent',
  }
}
