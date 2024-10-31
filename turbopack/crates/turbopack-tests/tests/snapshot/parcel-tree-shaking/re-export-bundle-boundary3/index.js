import { themed } from './theme/components.js';

output = import('./media-card/index.js').then(m => [m.default, themed()])
