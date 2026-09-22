const attachmentTypes = ['image', 'text', 'file'] as const

type AttachmentType = (typeof attachmentTypes)[number]

type ParseResult =
  | { success: true; data: AttachmentType }
  | { success: false; error: string }

export const attachmentTypeSchema = {
  safeParse(value: string): ParseResult {
    if (attachmentTypes.includes(value as AttachmentType)) {
      return { success: true, data: value as AttachmentType }
    }

    return { success: false, error: 'Unsupported attachment type' }
  },
}
