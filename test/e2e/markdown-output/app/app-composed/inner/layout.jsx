export const markdown = {
  components: {
    p({ children }) {
      return `inner:${children}`
    },
  },
}

export async function generateMarkdown(_props, { children }) {
  return `inner-start\n${await children}\ninner-end`
}

export default function InnerLayout({ children }) {
  return <article>{children}</article>
}
