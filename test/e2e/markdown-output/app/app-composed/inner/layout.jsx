export const markdown = {
  components: {
    p({ children }) {
      return `inner:${children}`
    },
  },
}

export function generateMarkdown(_props, { children }) {
  return `inner-start\n${children}\ninner-end`
}

export default function InnerLayout({ children }) {
  return <article>{children}</article>
}
