export const markdown = {
  components: {
    p({ children }) {
      return `page:${children}`
    },
  },
}
export const dynamic = 'force-dynamic'

export async function generateMarkdown(_props, { renderDefault }) {
  return renderDefault()
}

export default function AppComposedPage() {
  return <p>Nested value</p>
}
