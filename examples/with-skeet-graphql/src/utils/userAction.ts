export const copyToClipboard = (content: string | null | undefined) => {
  if (content == null) return false
  if (navigator == null) return false
  navigator.clipboard.writeText(content)
}
