import { revalidateTag } from './revalidate-tag'

export function revalidatePath(path: string) {
  return revalidateTag(path)
}
