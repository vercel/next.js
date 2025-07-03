import m from './module'

it('should apply shorthand properties correctly when renaming', function () {
  expect(m).toEqual({
    obj: {
      test: 'test1',
      test2: 'test2',
      test3: 'test3',
      test4: 'test4',
    },
    nested: {
      array: [
        {
          test: 'test1',
          test2: 'test2',
          test3: 'test3',
          test4: 'test4',
        },
      ],
    },
    test: 'test1',
    test2: 'test2',
    test3: 'test3',
    test4: 'test4',
    f: ['test2', 'test2', 'test3'],
  })
})
