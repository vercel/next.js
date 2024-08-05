import Stream from 'node:stream';

const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;

function fetch(){

}

export default fetch;
