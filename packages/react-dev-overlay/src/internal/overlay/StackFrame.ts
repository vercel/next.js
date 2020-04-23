class StackFrame {
  functionName: string | null
  fileName: string | null
  lineNumber: number | null
  columnNumber: number | null

  constructor(
    functionName: string | null = null,
    fileName: string | null = null,
    lineNumber: number | null = null,
    columnNumber: number | null = null
  ) {
    this.functionName = functionName
    this.fileName = fileName
    this.lineNumber = lineNumber
    this.columnNumber = columnNumber
  }

  /**
   * Returns the name of this function.
   */
  getFunctionName(): string | null {
    return this.functionName
  }

  /**
   * Returns the source of the frame.
   * This contains the file name, line number, and column number when available.
   */
  getSource(): string {
    let str = ''
    if (this.fileName != null) {
      str += this.fileName + ':'
    }
    if (this.lineNumber != null) {
      str += this.lineNumber + ':'
    }
    if (this.columnNumber != null) {
      str += this.columnNumber + ':'
    }
    return str.slice(0, -1)
  }

  /**
   * Returns a pretty version of this stack frame.
   */
  toString(): string {
    const f = this.getFunctionName()
    if (f == null) {
      return this.getSource()
    }
    return `${f} (${this.getSource()})`
  }
}

export { StackFrame }
