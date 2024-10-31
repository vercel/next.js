import * as foo from './foo';

output = foo['def' + (Date.now() > 0 ? 'ault' : '')];
