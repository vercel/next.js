class X {
  static bound_this_field = this.name
  static {
    const bound_this_static = this;
  }
  constructor() {
    const bound_this_ctor = this;
  }
}
// We should generate a freevar effect for this and only this
const free_this_root = this;
