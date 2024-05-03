module.exports = {
  /**
   * The "assetPrefix" here doesn't needs to be real as we doesn't load the page in the browser in this test,
   * we only care about if all assets prefixed with the "assetPrefix" are having correct "crossOrigin".
   */
  assetPrefix: 'https://example.vercel.sh',

  /**
   * According to HTML5 Spec (https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes),
   * crossorigin="" and crossorigin="anonymous" has the same effect. And ReactDOM's preload methods (preload, preconnect, etc.)
   * will prefer crossorigin="" to save bytes.
   *
   * So we use "use-credentials" here for easier testing.
   */
  crossOrigin: 'use-credentials',
}
