import { useCallback } from 'react'

export function useOpenInEditor({
  file,
  line1,
  column1,
}: {
  file?: string | null
  line1?: number | null
  column1?: number | null
} = {}) {
  const openInEditor = useCallback(() => {
    if (file == null || line1 == null || column1 == null) return

    const params = new URLSearchParams()
    params.append('file', file)
    params.append('line1', String(line1))
    params.append('column1', String(column1))

    self
      .fetch(
        `${
          process.env.__NEXT_ROUTER_BASEPATH || ''
        }/__nextjs_launch-editor?${params.toString()}`
      )
      .then(
        () => {},
        (cause) => {
          console.error(
            `Failed to open file "${file} (${line1}:${column1})" in your editor. Cause:`,
            cause
          )
        }
      )
  }, [file, line1, column1])

  return openInEditor
}
