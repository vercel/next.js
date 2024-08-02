function c(a, b) {
  return [`${a}${b}`, a];
}

const d = c("1", "2");

const [e, f] = d;
