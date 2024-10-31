import {foo} from './c';

output = import('./b').then(function (b) {
  return foo + b.foo;
});

