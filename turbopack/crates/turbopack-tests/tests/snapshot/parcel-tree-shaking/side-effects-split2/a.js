import * as x from 'lib';

output = import('./b').then(p => [x, p.default + p.foo + 456]);
