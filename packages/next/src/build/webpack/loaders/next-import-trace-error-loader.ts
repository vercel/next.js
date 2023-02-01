export default function nextImportTraceErrorLoader(this: any) {
  const { message } = this.getOptions()
  throw new Error(message)
}
