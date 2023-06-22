export const importMetaResolve = async (url: string): Promise<any> => {
  return import.meta.resolve?.(url)
}
