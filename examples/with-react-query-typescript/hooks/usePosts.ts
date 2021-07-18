import { TPost } from '../types';
import {
  useQuery,
  UseQueryResult,
} from "react-query";

export const api = async<T>(resource: string): Promise<T>=> {

  const response = await fetch(`https://jsonplaceholder.typicode.com${resource}`);

  if(!response.ok) {
    throw new Error(response.statusText)
  }

  return await response.json();
}
 
export const usePosts = <T>(key: any, url: string, isRouterReady: boolean): UseQueryResult<T, unknown> => {

  return useQuery(key, async () => {
    return await api<T>(url);
  }, {
    enabled: isRouterReady
  });

};
