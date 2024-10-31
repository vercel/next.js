import {compute} from './c'

var b = import('./b');

output = b.then(function ({foo, bar}) {
  return compute(foo, 0) + compute(bar, 0);
});
