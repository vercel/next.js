export const message = 'Initial message'
export const evaluatedAt = Date.now()

declare const module: any
if (typeof module !== 'undefined' && module.hot) {
  module.hot.accept()
}
