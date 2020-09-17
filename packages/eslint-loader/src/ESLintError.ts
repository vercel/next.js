///@ts-nocheck
export default class ESLintError extends Error {
  constructor(messages) {
    super(messages);
    this.name = 'ESLintError';
    this.stack = false;
  }
}
