class X {
  get named() {
    return "named";
  }

  get default() {
    return "default";
  }
}

module.exports = new X();
