export default function RouteRenderer({
  titleId,
  title,
  requiredComponentName,
  componentMap,
}) {
  const RequiredComponent = requiredComponentName
    ? componentMap[requiredComponentName]
    : null

  if (requiredComponentName && !RequiredComponent) {
    throw new Error(
      `Expected component "${requiredComponentName}" to be defined.`
    )
  }

  return (
    <main>
      <h1 id={titleId}>{title}</h1>
      {RequiredComponent ? <RequiredComponent /> : null}
    </main>
  )
}
