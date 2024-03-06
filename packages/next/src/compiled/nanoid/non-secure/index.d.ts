/**
 * Generate URL-friendly unique ID. This method uses the non-secure
 * predictable random generator with bigger collision probability.
 *
 * ```js
 * import { nanoid } from 'nanoid/non-secure'
 * model.id = nanoid() //=> "Uakgb_J5m9g-0JDMbcJqL"
 * ```
 *
 * @param size Size of the ID. The default size is 21.
 * @returns A random string.
 */
export function nanoid(size?: number): string

/**
 * Generate URL-friendly unique ID based on the custom alphabet.
 * This method uses the non-secure predictable random generator
 * with bigger collision probability.
 *
 * @param alphabet Alphabet used to generate the ID.
 * @param size Size of the ID.
 * @returns A random string.
 *
 * ```js
 * import { customAlphabet } from 'nanoid/non-secure'
 * const nanoid = customAlphabet('0123456789абвгдеё', 5)
 * model.id = //=> "8ё56а"
 * ```
 */
export function customAlphabet(alphabet: string, size: number): () => string
