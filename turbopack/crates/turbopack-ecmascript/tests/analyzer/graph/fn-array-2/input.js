function c(a, b) {
  var x = b;
  return [`${a}${x}`, a];
}

const d = c("1", "2");

const [e, f] = d;
