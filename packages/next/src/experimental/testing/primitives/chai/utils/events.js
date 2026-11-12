/*!
 * Chai - events utility
 * Copyright(c) 2011-2016 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

// Global EventTarget instance
export const events = new EventTarget()

export class PluginEvent extends Event {
  constructor(type, name, fn) {
    super(type)
    this.name = String(name)
    this.fn = fn
  }
}
