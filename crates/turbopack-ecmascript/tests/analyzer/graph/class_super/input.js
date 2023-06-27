import { named } from "./module.js";

class BaseClass {
  super(fn) {}
}

class SubClass extends BaseClass {
  constructor() {
    super(() => {
      named();
    });
  }
}