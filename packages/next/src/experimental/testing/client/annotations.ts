/** Attachments require a separately qualified parent-backed browser transport. */
export function prepareAnnotationAttachment(): never {
  throw new Error(
    'Browser Mode annotations and attachments are not supported yet.'
  )
}
export async function retainAnnotationAttachment(): Promise<never> {
  throw new Error(
    'Browser Mode annotations and attachments are not supported yet.'
  )
}
