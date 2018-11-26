import {
  coreContributorListJSON,
  userProfileJSON,
  userRepositoriesListJSON,
} from './data';

export const getUsers = () => Promise.resolve(coreContributorListJSON);

export const getUser = id => Promise.resolve(userProfileJSON[id]);

export const getUserRepositories = id =>
  Promise.resolve(userRepositoriesListJSON[id]);
