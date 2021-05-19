// __tests__/timerGame-test.js
'use strict';

jest.useFakeTimers();

test('waits 1 second', () => {
  const timeOut = require('./setTimout');
  timeOut();

  expect(setTimeout).toHaveBeenCalledTimes(1);
  expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);
});