import { unstable_revalidateTag } from './unstable-revalidate-tag'

export function unstable_revalidatePath(path: string) {
  return unstable_revalidateTag(path)
}
