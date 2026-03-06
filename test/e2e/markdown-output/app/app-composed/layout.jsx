export const markdown = {
  components: {
    p({ children }) {
      return `outer:${children}`
    },
  },
}

export async function generateMarkdown(_props, { children }) {
  return `outer-start\n${await children}\nouter-end`
}

export default function OuterLayout({ children }) {
  return <section>{children}</section>
}
