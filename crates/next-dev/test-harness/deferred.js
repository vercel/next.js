export class Deferred {
  constructor() {
    this.promise = new Promise((res, rej) => {
      this.resolve = res;
      this.rej = rej;
    });
  }
}
