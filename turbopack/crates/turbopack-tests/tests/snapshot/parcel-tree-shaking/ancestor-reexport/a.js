import {createAndFireEvent} from './b.js';
const createAndFireEventOnAtlaskit = createAndFireEvent('index');
output = import('./async.js').then(m => [
	createAndFireEventOnAtlaskit(),
	m.default(),
]);
