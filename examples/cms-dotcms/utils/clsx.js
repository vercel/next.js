/**
 * @author Daniel Esteves <danestves@gmail.com>
 *
 * Utility function to join classes
 *
 * @param classes Array of classes to append
 * @returns An string with the classes
 */
export function clsx(...classes) {
  return classes.filter(Boolean).join(' ')
}
