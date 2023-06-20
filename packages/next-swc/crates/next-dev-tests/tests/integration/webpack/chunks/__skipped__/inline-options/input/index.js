it('should be able to use eager mode', function () {
  function load(name) {
    return import(/* webpackMode: "eager" */ './dir1/' + name)
  }
  return testChunkLoading(load, true, true)
})

it('should be able to use lazy-once mode', function () {
  function load(name) {
    return import(/* webpackMode: "lazy-once" */ './dir2/' + name)
  }
  return testChunkLoading(load, false, true)
})

it('should be able to use lazy-once mode with name', function () {
  function load(name) {
    return import(
      /* webpackMode: "lazy-once", webpackChunkName: "name-lazy-once" */ './dir3/' +
        name
    )
  }
  return testChunkLoading(load, false, true)
})

it('should be able to use lazy mode', function () {
  function load(name) {
    return import(/* webpackMode: "lazy" */ './dir4/' + name)
  }
  return testChunkLoading(load, false, false)
})

it('should be able to use lazy mode with name', function () {
  function load(name) {
    return import(
      /* webpackMode: "lazy", webpackChunkName: "name-lazy" */ './dir5/' + name
    )
  }
  return testChunkLoading(load, false, false)
})

it('should be able to use lazy mode with name and placeholder', function () {
  function load(name) {
    return import(
      /* webpackMode: "lazy", webpackChunkName: "name-lazy-[request]" */ './dir6/' +
        name
    )
  }
  return testChunkLoading(load, false, false)
})

it('should be able to combine chunks by name', function () {
  function load(name) {
    switch (name) {
      case 'a':
        return import(/* webpackMode: "eager" */ './dir7/a')
      case 'b':
        return import(/* webpackChunkName: "name-3" */ './dir7/b')
      case 'c':
        return import(/* webpackChunkName: "name-3" */ './dir7/c')
      case 'd':
        return import(/* webpackChunkName: "name-3" */ './dir7/d')
      default:
        throw new Error('Unexpected test data')
    }
  }
  return testChunkLoading(load, false, true)
})

it('should be able to use weak mode', function () {
  function load(name) {
    return import(/* webpackMode: "weak" */ './dir8/' + name)
  }
  require('./dir8/a') // chunks served manually by the user
  require('./dir8/b')
  require('./dir8/c')
  return testChunkLoading(load, true, true)
})

it('should be able to use weak mode (without context)', function () {
  function load(name) {
    switch (name) {
      case 'a':
        return import(/* webpackMode: "weak" */ './dir9/a')
      case 'b':
        return import(/* webpackMode: "weak" */ './dir9/b')
      case 'c':
        return import(/* webpackMode: "weak" */ './dir9/c')
      default:
        throw new Error('Unexpected test data')
    }
  }
  require('./dir9/a') // chunks served manually by the user
  require('./dir9/b')
  require('./dir9/c')
  return testChunkLoading(load, true, true)
})

it('should not find module when mode is weak and chunk not served elsewhere', function () {
  var name = 'a'
  return import(/* webpackMode: "weak" */ './dir10/' + name).catch(function (
    e
  ) {
    expect(e).toMatchObject({
      message: /not available/,
      code: /MODULE_NOT_FOUND/,
    })
  })
})

it('should not find module when mode is weak and chunk not served elsewhere (without context)', function () {
  return import(/* webpackMode: "weak" */ './dir11/a').catch(function (e) {
    expect(e).toMatchObject({
      message: /not available/,
      code: /MODULE_NOT_FOUND/,
    })
  })
})

if (process.env.NODE_ENV === 'production') {
  it('should contain only one export from webpackExports from module', function () {
    return import(/* webpackExports: "usedExports" */ './dir12/a?1').then(
      (module) => {
        expect(module.usedExports).toEqual(['usedExports'])
      }
    )
  })

  it('should contain only webpackExports from module', function () {
    return import(
      /* webpackExports: ["a", "usedExports", "b"] */ './dir12/a?2'
    ).then((module) => {
      expect(module.usedExports).toEqual(['a', 'b', 'usedExports'])
    })
  })

  it('should contain only webpackExports from module in eager mode', function () {
    return import(
      /*
			webpackMode: "eager",
			webpackExports: ["a", "usedExports", "b"]
		*/ './dir12/a?3'
    ).then((module) => {
      expect(module.usedExports).toEqual(['a', 'b', 'usedExports'])
    })
  })

  it('should contain webpackExports from module in weak mode', function () {
    require.resolve('./dir12/a?4')
    return import(
      /*
			webpackMode: "weak",
			webpackExports: ["a", "usedExports", "b"]
		*/ './dir12/a?4'
    ).then((module) => {
      expect(module.usedExports).toEqual(['a', 'b', 'usedExports'])
    })
  })

  it('should not mangle webpackExports from module', function () {
    return import(/* webpackExports: "longnameforexport" */ './dir12/a?5').then(
      (module) => {
        expect(module).toHaveProperty('longnameforexport')
      }
    )
  })

  it('should not mangle default webpackExports from module', function () {
    return import(/* webpackExports: "default" */ './dir12/a?6').then(
      (module) => {
        expect(module).toHaveProperty('default')
      }
    )
  })

  it('should contain only webpackExports from module in context mode', function () {
    const x = 'b'
    return import(/* webpackExports: "usedExports" */ `./dir13/${x}`).then(
      (module) => {
        expect(module.usedExports).toEqual(['usedExports'])
      }
    )
  })
}

function testChunkLoading(load, expectedSyncInitial, expectedSyncRequested) {
  var sync = false
  var syncInitial = true
  var p = Promise.all([load('a'), load('b')]).then(function () {
    expect(syncInitial).toBe(expectedSyncInitial)
    sync = true
    var p = Promise.all([
      load('a').then(function (a) {
        expect(a).toEqual(
          nsObj({
            default: 'a',
          })
        )
        expect(sync).toBe(true)
      }),
      load('c').then(function (c) {
        expect(c).toEqual(
          nsObj({
            default: 'c',
          })
        )
        expect(sync).toBe(expectedSyncRequested)
      }),
    ])
    Promise.resolve()
      .then(function () {})
      .then(function () {})
      .then(function () {})
      .then(function () {
        sync = false
      })
    return p
  })
  Promise.resolve()
    .then(function () {})
    .then(function () {})
    .then(function () {})
    .then(function () {
      syncInitial = false
    })
  return p
}
