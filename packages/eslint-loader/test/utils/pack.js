import webpack from 'webpack';

import conf from './conf';

export default (entry, loaderConf = {}, webpackConf = {}) => {
  return webpack(conf(entry, loaderConf, webpackConf));
};
