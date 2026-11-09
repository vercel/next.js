// The modules of this fixture that were evaluated, in order.
export function evaluated(): string[] {
  return ((globalThis as any).__evaluatedModules ??= [])
}
