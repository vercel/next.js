export function useMarkdownComponents() {
  return {
    p({ children }) {
      return `root:${children}`
    },
  }
}
