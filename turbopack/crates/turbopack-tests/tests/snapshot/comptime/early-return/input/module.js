export function a() {
  if (true) {
    a1()
    return
  }
  a2()
  var a3 = 3
  function a4() {
    var a5
  }
  ;(function a6() {
    var a7
  })
  const a8 = () => {
    var a9
  }
  class a10 {}
  let a11 = 11
  let {
    a12 = 12,
    a14: {
      a15,
      a16: [a17, ...a18],
    },
    ...a19
  } = {}
  function a20() {
    return
    a21()
  }
  ;({
    get a22() {
      var a23
    },
    set a22(value) {
      var a24
    },
    a25() {
      var a26
    },
  })
  {
    let a27
    var a28
  }
}

export function b() {
  if (true) {
    b1()
    return
  } else {
    b2()
  }
  b3()
}

export function c() {
  if (true) {
    return
  }
  c1()
}

export function d() {
  if (true) {
    return
  } else {
    d1()
  }
  d2()
}

export function e() {
  if (false) {
    e1()
  } else {
    return
  }
  e2()
}

export function f() {
  if (false) {
  } else {
    return
  }
  f1()
}

export function g() {
  if (false) {
    g1()
  } else {
    g2()
    return
  }
  g3()
}

export function h() {
  if (false) {
  } else {
    h1()
    return
  }
  h2()
}

export function i(j) {
  if (j < 1) return i1()
  return i2()
}

export function j(j) {
  if (j < 1) {
    return i1()
  }
  return i2()
}

class K {
  constructor() {
    try {
      k1()
    } catch (e) {
      k2()
      return
      k3()
    } finally {
      k4()
    }
    k5()
  }

  l() {
    try {
      l1()
    } catch (e) {
      l2()
    } finally {
      l3()
      return
      l4()
    }
    l5()
  }

  get m() {
    if (true) {
      m1()
      return
    }
    m2()
  }

  set m(value) {
    m1()
    return m2()
    m3()
  }

  n = () => {
    switch (42) {
      case 1:
        n1()
        return
        n2()
      case 2:
        n3()
        break
      default:
        n4()
    }
    n5()
  }

  o() {
    if (something) {
      require('./module')
      return
    } else {
      require('./module')
      return
    }
  }
}

function p() {
  class C {
    constructor() {
      p1()
      return
      p2()
    }
  }

  p3()
  return
  p4()
}

z1()

return

z2()
