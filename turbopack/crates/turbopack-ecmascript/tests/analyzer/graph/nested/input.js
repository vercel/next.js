function a() {
  let x = 1;
  let y = x;
  let z = a;
}

let b = function () {
  let x = 1;
  let y = x;
};

let c = () => {
  let x = 1;
  let y = x;
};

class d {
  m() {
    let x = 1;
    let y = x;
    let z = d;
  }
  n = () => {
    let x = 1;
    let y = x;
    let z = d;
  };
}

var f = function e() {
  let x = 1;
  let y = x;
  let z = e;
  let z2 = f;
};
