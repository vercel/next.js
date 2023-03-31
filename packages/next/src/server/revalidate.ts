export async function revalidateTag(tag: string) {
  return await (fetch as any).revalidateTag(tag)
}
