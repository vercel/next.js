import { SuperClass } from './dep2'

var UnusedClass = class extends SuperClass {
    constructor() {
      super()
    }
  },
  unusedVariable = new UnusedClass()
