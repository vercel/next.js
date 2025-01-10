import * as R from 'ramda';
import {pipe} from 'ramda';

console.log((0, R.pipe)('a', 'b', 'c'));
console.log(pipe('d', 'e', 'f'));


it('should import only pipe.js', () => {
  expect(pipe).toBeDefined();
});
