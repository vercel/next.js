import {
  exportsInfoForA,
  exportsInfoForB,
  exportsInfoForC,
  exportsInfoForY,
  exportsInfoForZ,
  exportsInfoForW,
  exportsInfoForJ,
  exportsInfoForK,
  exportsInfoForMixin1,
  exportsInfoForMixin2,
  exportsInfoForMixin3,
  exportsInfoForMixin4,
  exportsInfoForMixin5,
  exportsInfoForBaseError,
  exportsInfoForBaseError1,
  exportsInfoForBaseError2,
  exportsInfoForBaseError3,
  exportsInfoForSuperClass,
} from './dep2'

it('should load modules correctly', () => {
  require('./module1')
  require('./module2')
  require('./module3')
  require('./module4')
  require('./module5')
  require('./module6')
  require('./module7')
  require('./module8')
  require('./module9')
})

if (process.env.NODE_ENV === 'production') {
  it('W and J should not be used', () => {
    expect(exportsInfoForJ).toBe(false)
    expect(exportsInfoForW).toBe(false)
  })

  it('Keep extends with constructor', () => {
    expect(exportsInfoForBaseError).toBe(true)
    expect(exportsInfoForBaseError1).toBe(true)
    expect(exportsInfoForBaseError2).toBe(false)
    expect(exportsInfoForBaseError3).toBe(false)
  })
}

it('A should be used', () => {
  expect(exportsInfoForA).toBe(true)
})

it('B should be used', () => {
  expect(exportsInfoForB).toBe(true)
})

it('K should be used', () => {
  expect(exportsInfoForK).toBe(true)
})

it('Z used, inner graph can not determine const usage', () => {
  expect(exportsInfoForZ).toBe(true)
})

it('SuperClass should be used', () => {
  expect(exportsInfoForSuperClass).toBe(true)
})

it('Pure super expression should be unused, another used', () => {
  if (process.env.NODE_ENV === 'production') {
    expect(exportsInfoForMixin4).toBe(false)
    expect(exportsInfoForMixin5).toBe(false)
  }

  expect(exportsInfoForMixin1).toBe(true)
  expect(exportsInfoForMixin2).toBe(true)
  expect(exportsInfoForMixin3).toBe(true)
  expect(exportsInfoForC).toBe(true)
  expect(exportsInfoForY).toBe(true)
})
