import debug from 'debug';
import { value } from './module';
import { value as imported } from 'imported';

console.log(value, imported as any);
