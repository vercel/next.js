throw new Error('fully mocked original must stay lazy')
// eslint-disable-next-line no-unreachable -- Evaluating this supposedly lazy original must throw before its exports are observed.
export const value = 0
export const token = null
