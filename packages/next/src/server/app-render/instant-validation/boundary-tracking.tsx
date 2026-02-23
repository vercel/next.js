export type ValidationBoundaryTracking = {
  expectedIds: Set<string>
  renderedIds: Set<string>
}

export function createValidationBoundaryTracking(): ValidationBoundaryTracking {
  return {
    expectedIds: new Set(),
    renderedIds: new Set(),
  }
}
