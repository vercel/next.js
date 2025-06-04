/**
 * The rendering mode for a route.
 */
export const enum RenderingMode {
  /**
   * `STATIC` rendering mode will output a fully static HTML page or error if
   * anything dynamic is used.
   */
  STATIC = 'STATIC',

  /**
   * `PARTIALLY_STATIC` rendering mode will output a fully static HTML page if
   * the route is fully static, but will output a partially static HTML page if
   * the route uses uses any dynamic API's.
   */
  PARTIALLY_STATIC = 'PARTIALLY_STATIC',
}
