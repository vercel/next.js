/// <reference types="./delete-result.d.ts" />
export class DeleteResult {
  numDeletedRows
  constructor(numDeletedRows) {
    this.numDeletedRows = numDeletedRows
  }
}
