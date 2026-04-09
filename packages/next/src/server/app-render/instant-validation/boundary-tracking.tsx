export type ValidationBoundaryTracking = {
  requiredIds: Set<string>
  renderedIds: Set<string>
}

export function createValidationBoundaryTracking(): ValidationBoundaryTracking {
  return {
    requiredIds: new Set(),
    renderedIds: new Set(),
  }
}

export function allRequiredBoundariesRendered(
  state: ValidationBoundaryTracking
): boolean {
  for (const id of state.requiredIds) {
    if (!state.renderedIds.has(id)) {
      return false
    }
  }
  return true
}
