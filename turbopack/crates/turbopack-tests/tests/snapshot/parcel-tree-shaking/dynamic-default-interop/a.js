import shared from './shared';

output = import('./b').then(b => b.out + shared);
