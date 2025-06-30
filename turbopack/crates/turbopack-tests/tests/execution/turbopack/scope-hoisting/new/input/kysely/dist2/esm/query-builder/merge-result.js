/// <reference types="./merge-result.d.ts" />
export class MergeResult {
  numChangedRows
  constructor(numChangedRows) {
    this.numChangedRows = numChangedRows
  }
}
