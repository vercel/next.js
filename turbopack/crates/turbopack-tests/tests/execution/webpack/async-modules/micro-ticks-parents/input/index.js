import * as tick from './tick'

it('should execute async modules in to correct order and without additional ticks (case a)', async () => {
  tick.start()
  await require('./case-a/f')
  expect(tick.stop()).toEqual([
    'e 0',
    'async before 0',
    'async middle 1',
    'async after 2',
    'b 3',
    'c 3',
    'a 3',
    'd 3',
    'async2 before 3',
    'async2 middle 4',
    'async2 after 5',
    'f 6',
  ])
})

it('should execute async modules in to correct order and without additional ticks (case b)', async () => {
  tick.start()
  await require('./case-b/e')
  expect(tick.stop()).toEqual([
    'async before 0',
    'async middle 1',
    'async after 2',
    'c 3',
    'b 3',
    'a 3',
    'd 3',
    'async before 3',
    'async middle 4',
    'async after 5',
  ])
})

it('should execute async modules in to correct order and without additional ticks (case c)', async () => {
  tick.start()
  await require('./case-c/a')
  expect(tick.stop()).toEqual(['b 0', 'a before 0', 'a after 1'])
})

it('should execute async modules in to correct order and without additional ticks (case d)', async () => {
  tick.start()
  await require('./case-d/index')
  expect(tick.stop()).toEqual([
    'c before 0',
    'c after 1',
    'b before 2',
    'b after 3',
    'a before 4',
    'a after 5',
    'x 6',
    'y 6',
    'index 6',
  ])
})

it('should execute async modules in to correct order and without additional ticks (case e)', async () => {
  tick.start()
  await require('./case-e/index')
  expect(tick.stop()).toEqual([
    'async before 0',
    'async middle 1',
    'async after 2',
    'a 3',
    // see https://github.com/tc39/proposal-top-level-await/issues/158
    'b 3',
    'x 3',
    'index 3',
  ])
})
