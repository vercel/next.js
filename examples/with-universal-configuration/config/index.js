const commandLineArgs = require('command-line-args');

const optionDefinitions = [
    { name: 'env', alias: 'e', type: String }
];

const args = commandLineArgs(optionDefinitions);
const config = args.env === "production" ? require( "./prodConfig" ) : require( "./localConfig" );

module.exports = {
  'BACKEND_URL': config.backendUrl
}
