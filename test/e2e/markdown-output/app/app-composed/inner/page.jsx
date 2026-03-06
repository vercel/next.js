export const markdown = {
  components: {
    p({ children }) {
      return `page:${children}`
    },
  },
}
export const dynamic = 'force-dynamic'

export function generateMarkdown(_props, { content }) {
  return content
}

export default function AppComposedPage() {
  return <p>Nested value</p>
}
