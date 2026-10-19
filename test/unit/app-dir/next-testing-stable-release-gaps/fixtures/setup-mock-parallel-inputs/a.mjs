throw new Error('first parallel original must stay lazy')
// eslint-disable-next-line no-unreachable -- Evaluating this supposedly lazy original must throw before its exports are observed.
export const value = 0
