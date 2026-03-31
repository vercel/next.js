export async function getOutputLogJson(next, outputLogPath) {
  if (!(await next.hasFile(outputLogPath))) {
    return {}
  }
  const content = await next.readFile(outputLogPath)
  return JSON.parse(content)
}
