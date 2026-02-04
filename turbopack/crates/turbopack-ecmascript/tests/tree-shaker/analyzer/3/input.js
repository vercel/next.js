

function d1() { }


function d2() { }

function d3() { }




export function c1_1() {
  return c1_2()
}

function c1_2() {
  return c1_3(d1)
}
export function c1_3() {
  return c1_1(d2)
}


function c2_1() {
  return c2_2(d3)
}

export function c2_2() {
  return c2_3()
}
function c2_3() {
  return c2_1()
}


c1_3()
c2_2()