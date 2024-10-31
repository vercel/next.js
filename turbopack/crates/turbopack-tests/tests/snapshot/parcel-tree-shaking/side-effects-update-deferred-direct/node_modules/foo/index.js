import a from 'bar/a.js';
import other from './foo.js';

export default function() {
    return `${a}${other()}`;
}
