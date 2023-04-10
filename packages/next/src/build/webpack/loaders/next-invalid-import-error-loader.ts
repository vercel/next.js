export default function nextInvalidImportErrorLoader(this: any) {
  const { message } = this.getOptions()
  throw new Error(message)
}
