import debug from 'next/dist/compiled/debug'

/**
 * Adds debug log functionality to a class. Any class that extends this class
 * will have access to the `debug` method, which can be used to log debug
 * messages with the `next:debug` namespace and the class name.
 */
export class Debuggable {
  protected readonly debug = debug('next:debug').extend(
    // Convert the class name to kebab-case.
    this.constructor.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  )
}
