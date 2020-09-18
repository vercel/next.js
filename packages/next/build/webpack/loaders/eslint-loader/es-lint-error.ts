export default class ESLintError extends Error {
  constructor(messages: any) {
    super(messages);
    this.name = 'ESLintError';
  }
}
