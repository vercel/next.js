import { useCallback } from 'react'

type EditorLocation = {
  file?: string | null
  line1?: number | null
  column1?: number | null
}

export async function openInEditor({ file, line1, column1 }: EditorLocation) {
  if (file == null || line1 == null || column1 == null) return
  const params = new URLSearchParams({
    file,
    line1: String(line1),
    column1: String(column1),
  })
  const response = await self.fetch(
    `${process.env.__NEXT_ROUTER_BASEPATH || ''}/__nextjs_launch-editor?${params}`
  )
  if (!response.ok) throw new Error('Failed to open source in editor')
}

export function useOpenInEditor({ file, line1, column1 }: EditorLocation = {}) {
  const handleOpenInEditor = useCallback(() => {
    if (file == null || line1 == null || column1 == null) return

    openInEditor({ file, line1, column1 }).catch((cause) => {
      console.error(
        `Failed to open file "${file} (${line1}:${column1})" in your editor. Cause:`,
        cause
      )
    })
  }, [file, line1, column1])

  return handleOpenInEditor
}
