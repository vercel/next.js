const a = () => 1;
const b = () => 2;

const c = () => {
  return 1;
};
const d = () => {
  return 2;
};
const e = function () {
  return 3;
};
const f = function e() {
  return 4;
};

function x() {
  const xa = () => 1;
  const xb = () => 2;

  const xc = () => {
    return 1;
  };
  const xd = () => {
    return 2;
  };
  const xe = function () {
    return 3;
  };
  const xf = function xe() {
    return 4;
  };
}
