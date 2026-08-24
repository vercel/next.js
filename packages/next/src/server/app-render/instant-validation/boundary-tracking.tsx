export type ValidationBoundaryTracking = {
  /**
   * Map from boundary id (the SegmentPath where a validation boundary is
   * placed) to the file paths of modules inside that boundary's subtree.
   * When the boundary spans multiple parallel slots, each slot contributes
   * its own first-found module path so all unrendered segments can be
   * reported together.
   */
  requiredIds: Map<string, string[]>
  renderedIds: Set<string>
}

export function createValidationBoundaryTracking(
  /** Pass if the render is expected to render the same IDs as a previous one. */
  matchPrevious?: ValidationBoundaryTracking
): ValidationBoundaryTracking {
  return {
    requiredIds: matchPrevious ? new Map(matchPrevious.requiredIds) : new Map(),
    renderedIds: new Set(),
  }
}

export function allRequiredBoundariesRendered(
  state: ValidationBoundaryTracking
): boolean {
  for (const id of state.requiredIds.keys()) {
    if (!state.renderedIds.has(id)) {
      return false
    }
  }
  return true
}
