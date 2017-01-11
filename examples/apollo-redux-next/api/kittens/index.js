import axios from 'axios';
/**
 * Get the response of the api call to get the kitten list.
 * If you want to create your api check this repository https://github.com/jsantana90/nextjs-express-boilerplate
 * @return {AxiosPromise}
 */
function getKittens () {
  return axios.get('https://nextjs-express-boilerplate-vxqbpvxtnf.now.sh/');
}

export {
  getKittens
};