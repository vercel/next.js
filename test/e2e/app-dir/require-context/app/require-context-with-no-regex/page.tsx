export default function RequireContextWithNoRegex() {
  const translationsContext = (require as any).context('../grandparent', true)
  return <pre>{JSON.stringify(translationsContext.keys())}</pre>
}
