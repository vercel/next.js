let count = 0

describe('Simple Assignment', () => {
  it('handles static declaration', () => {
    const bool = true
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles static expression', () => {
    let bool = false
    bool = true
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic declaration', () => {
    function dynamic() {
      return true
    }
    const bool = dynamic()
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic expression', () => {
    function dynamic() {
      return true
    }
    let bool = false
    bool = dynamic()
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })
})

describe('Object Patterns', () => {
  it('handles static declaration', () => {
    const { bool } = {
      bool: true,
    }
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles static expression', () => {
    let bool = false
    ;({ bool } = {
      bool: true,
    })
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic declaration', () => {
    function dynamic() {
      return {
        bool: true,
      }
    }
    const { bool } = dynamic()
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic expression', () => {
    function dynamic() {
      return {
        bool: true,
      }
    }
    let bool = false
    ;({ bool } = dynamic())
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })
})

describe('Array Patterns', () => {
  it('handles static declaration', () => {
    const [bool] = [true]
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles static expression', () => {
    let bool = false
    ;[bool] = [true]
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic declaration', () => {
    function dynamic() {
      return [true]
    }
    const [bool] = dynamic()
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic expression', () => {
    function dynamic() {
      return [true]
    }
    let bool = false
    ;[bool] = dynamic()
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })
})

describe('Nested Patterns', () => {
  it('handles static declaration', () => {
    const {
      inner: [bool],
    } = {
      inner: [true],
    }
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles static expression', () => {
    let bool = false
    ;({
      inner: [bool],
    } = {
      inner: [true],
    })
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic declaration', () => {
    function dynamic() {
      return {
        inner: [true],
      }
    }
    const {
      inner: [bool],
    } = dynamic()
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })

  it('handles dynamic expression', () => {
    function dynamic() {
      return {
        inner: [true],
      }
    }
    let bool = false
    ;({
      inner: [bool],
    } = dynamic())
    if (bool) {
      count++
    } else {
      throw Error('this branch is not taken')
    }
  })
})

it('took the right number of branches', () => {
  expect(count).toEqual(16)
})
