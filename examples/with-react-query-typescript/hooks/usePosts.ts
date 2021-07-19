import { TPost } from '../types';
import {
  useQuery,
} from "react-query";
import { useRouterReady } from './common';

export const api = async<T>(resource: string): Promise<T>=> {

  const response = await fetch(`https://jsonplaceholder.typicode.com${resource}`);

  if(!response.ok) {
    throw new Error(response.statusText)
  }

  return await response.json();
}
 
export const usePost = () => {
  const { isRouterReady, router } = useRouterReady();

  return useQuery(["posts", router.query.id], async () => {
    return await api<TPost>(`/posts/${router.query.id}`);
  }, {
    enabled: isRouterReady
  });

};

export const usePosts = () => {
  const { isRouterReady } = useRouterReady();

  return useQuery(["posts", '_limit=3'], async () => {
    return await api<TPost[]>('/posts?_limit=3');
  }, {
    enabled: isRouterReady
  });

};
