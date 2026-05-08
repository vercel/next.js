import path from 'node:path'

import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import { OFFLINE_NAVIGATION_SERVICE_WORKER } from '../shared/lib/offline-navigation'
import { OFFLINE_NAVIGATION_FALLBACK_SERVED } from '../shared/lib/offline-navigation-constants'

export function getOfflineNavigationServiceWorkerFilePath(): string {
  return path.join(CLIENT_STATIC_FILES_PATH, OFFLINE_NAVIGATION_SERVICE_WORKER)
}

// The first version of offline navigations uses a generated, app-local service
// worker as a document fallback only. It is network-first for regular loads and
// only serves the fallback document after the network request fails.
export function createOfflineNavigationServiceWorker({
  buildId,
  cacheNamespace,
  fallbackDocumentHref,
  manifestHref,
}: {
  buildId: string
  cacheNamespace: string
  fallbackDocumentHref: string
  manifestHref: string
}): string {
  const metadata = JSON.stringify({
    buildId,
    cacheNamespace,
    fallbackDocumentHref,
    manifestHref,
    source: 'offline-navigation-service-worker',
  })
  const fallbackServedMessageType = JSON.stringify(
    OFFLINE_NAVIGATION_FALLBACK_SERVED
  )

  return `self.__NEXT_OFFLINE_NAVIGATION_SW=${metadata};
const CACHE_PREFIX='next-offline-navigation-v1:';
function withDeploymentQuery(href){
  const url=new URL(href,self.location.origin);
  const deploymentParams=new URLSearchParams(self.location.search);
  deploymentParams.forEach((value,key)=>{
    if(!url.searchParams.has(key)){
      url.searchParams.set(key,value);
    }
  });
  return url.href;
}
async function fetchRequiredResource(href){
  const response=await fetch(withDeploymentQuery(href),{cache:'no-store'});
  if(!response.ok){
    throw new Error('Failed to cache offline navigation resource: '+href);
  }
  return response;
}
async function cacheOfflineNavigationResources(){
  const metadata=self.__NEXT_OFFLINE_NAVIGATION_SW;
  const cache=await caches.open(metadata.cacheNamespace);
  const manifestResponse=await fetchRequiredResource(metadata.manifestHref);
  const manifest=await manifestResponse.clone().json();
  await cache.put(metadata.manifestHref,manifestResponse);
  const fallbackResponse=await fetchRequiredResource(manifest.fallbackDocument.href);
  await cache.put(manifest.fallbackDocument.href,fallbackResponse);
}
function isDocumentNavigationRequest(request){
  if(request.method!=='GET'||request.mode!=='navigate'||request.destination!=='document'){
    return false;
  }
  const url=new URL(request.url);
  return url.origin===self.location.origin;
}
async function fetchDocumentNavigation(request){
  try{
    return await fetch(request);
  }catch(err){
    const metadata=self.__NEXT_OFFLINE_NAVIGATION_SW;
    const cache=await caches.open(metadata.cacheNamespace);
    const fallbackResponse=await cache.match(metadata.fallbackDocumentHref);
    if(fallbackResponse){
      await notifyClients({
        type:${fallbackServedMessageType},
        buildId:metadata.buildId,
        reason:'network-error',
        url:request.url
      });
      return fallbackResponse;
    }
    throw err;
  }
}
async function notifyClients(message){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(clients.map((client)=>client.postMessage(message)));
}
self.addEventListener('install',(event)=>{
  event.waitUntil((async()=>{
    await cacheOfflineNavigationResources();
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',(event)=>{
  event.waitUntil((async()=>{
    const metadata=self.__NEXT_OFFLINE_NAVIGATION_SW;
    const cacheNames=await caches.keys();
    await Promise.all(cacheNames.map((cacheName)=>{
      if(cacheName.startsWith(CACHE_PREFIX)&&cacheName!==metadata.cacheNamespace){
        return caches.delete(cacheName);
      }
    }));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',(event)=>{
  if(isDocumentNavigationRequest(event.request)){
    event.respondWith(fetchDocumentNavigation(event.request));
  }
});
`
}
