import path from 'node:path'

import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import {
  OFFLINE_NAVIGATION_CACHE_PREFIX,
  OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS,
  OFFLINE_NAVIGATION_FALLBACK_SERVED,
  OFFLINE_NAVIGATION_SERVICE_WORKER,
  OFFLINE_NAVIGATION_SERVICE_WORKER_METADATA_GLOBAL,
} from '../shared/lib/offline-navigation-constants'

export function getOfflineNavigationServiceWorkerFilePath(): string {
  return path.join(CLIENT_STATIC_FILES_PATH, OFFLINE_NAVIGATION_SERVICE_WORKER)
}

export function getOfflineNavigationCacheNamespace({
  basePath,
  buildId,
}: {
  basePath: string
  buildId: string
}): string {
  return `${OFFLINE_NAVIGATION_CACHE_PREFIX}${buildId}:${basePath || '/'}`
}

const serviceWorkerMetadataReference = `self.${OFFLINE_NAVIGATION_SERVICE_WORKER_METADATA_GLOBAL}`

function renderServiceWorkerMetadata(metadata: unknown): string {
  return `${serviceWorkerMetadataReference}=${JSON.stringify(metadata)};`
}

function readServiceWorkerMetadataSource(): string {
  return `const metadata=${serviceWorkerMetadataReference};`
}

const cachePrefixSource = `const CACHE_PREFIX=${JSON.stringify(
  OFFLINE_NAVIGATION_CACHE_PREFIX
)};`

const hrefNormalizationSource = [
  'function normalizeHref(href){',
  'const url=new URL(href,self.location.origin);',
  "url.search='';",
  "url.hash='';",
  'return url.href;',
  '}',
  'function withDeploymentQuery(href){',
  'const url=new URL(normalizeHref(href));',
  'const deploymentParams=new URLSearchParams(self.location.search);',
  'deploymentParams.forEach((value,key)=>{',
  'if(!url.searchParams.has(key)){url.searchParams.set(key,value);}',
  '});',
  'return url.href;',
  '}',
].join('')

const requiredResourceCachingSource = [
  'async function fetchRequiredResource(href,withDeploymentId){',
  'const normalizedHref=normalizeHref(href);',
  'const resourceHref=withDeploymentId?withDeploymentQuery(normalizedHref):normalizedHref;',
  'let response;',
  "try{response=await fetch(resourceHref,{cache:'no-store'});}",
  'catch(err){',
  'if(withDeploymentId){throw err;}',
  "response=await fetch(resourceHref,{cache:'no-store',mode:'no-cors'});",
  '}',
  "if(!response.ok&&response.type!=='opaque'){",
  "throw new Error('Failed to cache offline navigation resource: '+href);",
  '}',
  'return response;',
  '}',
  'async function cacheOfflineNavigationResources(){',
  readServiceWorkerMetadataSource(),
  'const cache=await caches.open(metadata.cacheNamespace);',
  'const fallbackResponse=await fetchRequiredResource(metadata.fallbackDocumentHref,true);',
  'await cache.put(normalizeHref(metadata.fallbackDocumentHref),fallbackResponse);',
  'await Promise.all(metadata.fallbackAssetHrefs.map(async(href)=>{',
  'const response=await fetchRequiredResource(href,false);',
  'await cache.put(normalizeHref(href),response);',
  '}));',
  '}',
].join('')

const assetCacheKeySource = [
  'function getFallbackAssetCacheKey(request){',
  "if(request.method!=='GET'){return null;}",
  'const requestHref=normalizeHref(request.url);',
  readServiceWorkerMetadataSource(),
  'return metadata.fallbackAssetHrefs.some((href)=>normalizeHref(href)===requestHref)?requestHref:null;',
  '}',
  'function getManagedStaticAssetCacheKey(request){',
  "if(request.method!=='GET'){return null;}",
  'return getManagedStaticAssetCacheKeyFromHref(request.url);',
  '}',
  'function getManagedStaticAssetCacheKeyFromHref(href){',
  'let url;',
  'try{url=new URL(href,self.location.origin);}',
  'catch(err){return null;}',
  "if(!url.pathname.includes('/_next/static/')||url.pathname.includes('/_offline-navigation-')){return null;}",
  "url.search='';",
  "url.hash='';",
  'return url.href;',
  '}',
  'function getStaticAssetPromotionRequestHref(href){',
  'let url;',
  'try{url=new URL(href,self.location.origin);}',
  'catch(err){return null;}',
  'if(url.origin!==self.location.origin||getManagedStaticAssetCacheKeyFromHref(url.href)===null){return null;}',
  "url.hash='';",
  'return url.href;',
  '}',
].join('')

const staticAssetFetchSource = [
  'async function fetchManagedStaticAsset(request){',
  'const cacheKey=getFallbackAssetCacheKey(request)||getManagedStaticAssetCacheKey(request);',
  'if(cacheKey===null){return fetch(request);}',
  readServiceWorkerMetadataSource(),
  'const cache=await caches.open(metadata.cacheNamespace);',
  'const cachedResponse=await cache.match(cacheKey);',
  'if(cachedResponse){return cachedResponse;}',
  'const response=await fetch(request);',
  "if(response.ok||response.type==='opaque'){await cache.put(cacheKey,response.clone());}",
  'return response;',
  '}',
].join('')

const currentAssetPromotionSource = [
  'async function cacheCurrentStaticAssets(hrefs){',
  'if(!Array.isArray(hrefs)||hrefs.length===0){return;}',
  readServiceWorkerMetadataSource(),
  'const cache=await caches.open(metadata.cacheNamespace);',
  'await Promise.all(hrefs.slice(0,128).map(async(href)=>{',
  "if(typeof href!=='string'||href.length>4096){return;}",
  'const cacheKey=getManagedStaticAssetCacheKeyFromHref(href);',
  'if(cacheKey===null){return;}',
  'const cachedResponse=await cache.match(cacheKey);',
  'if(cachedResponse){return;}',
  'const requestHref=getStaticAssetPromotionRequestHref(href);',
  'if(requestHref===null){return;}',
  'let response;',
  "try{response=await fetch(requestHref,{cache:'only-if-cached',mode:'same-origin'});}",
  'catch(err){return;}',
  'if(response.ok){await cache.put(cacheKey,response);}',
  '}));',
  '}',
].join('')

const installAndActivateListenersSource = [
  "self.addEventListener('install',(event)=>{",
  'event.waitUntil((async()=>{',
  'await cacheOfflineNavigationResources();',
  'await self.skipWaiting();',
  '})());',
  '});',
  "self.addEventListener('activate',(event)=>{",
  'event.waitUntil((async()=>{',
  readServiceWorkerMetadataSource(),
  'const cacheNames=await caches.keys();',
  'await Promise.all(cacheNames.map((cacheName)=>{',
  'if(cacheName.startsWith(CACHE_PREFIX)&&cacheName!==metadata.cacheNamespace){',
  'return caches.delete(cacheName);',
  '}',
  '}));',
  'await self.clients.claim();',
  '})());',
  '});',
].join('')

function renderDocumentNavigationSource(
  fallbackServedMessageType: string
): string {
  return [
    'function isDocumentNavigationRequest(request){',
    "if(request.method!=='GET'||request.mode!=='navigate'||request.destination!=='document'){return false;}",
    'const url=new URL(request.url);',
    'return url.origin===self.location.origin;',
    '}',
    'async function fetchDocumentNavigation(request){',
    'try{return await fetch(request);}',
    'catch(err){',
    readServiceWorkerMetadataSource(),
    'const cache=await caches.open(metadata.cacheNamespace);',
    'const fallbackResponse=await cache.match(normalizeHref(metadata.fallbackDocumentHref));',
    'if(fallbackResponse){',
    `await notifyClients({type:${JSON.stringify(fallbackServedMessageType)}});`,
    'return fallbackResponse;',
    '}',
    'throw err;',
    '}',
    '}',
    'async function notifyClients(message){',
    "const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});",
    'await Promise.all(clients.map((client)=>client.postMessage(message)));',
    '}',
  ].join('')
}

const fetchListenerSource = [
  "self.addEventListener('fetch',(event)=>{",
  'if(isDocumentNavigationRequest(event.request)){',
  'event.respondWith(fetchDocumentNavigation(event.request));',
  '}else if(getFallbackAssetCacheKey(event.request)!==null||getManagedStaticAssetCacheKey(event.request)!==null){',
  'event.respondWith(fetchManagedStaticAsset(event.request));',
  '}',
  '});',
].join('')

function renderMessageListener(messageType: string): string {
  return `self.addEventListener('message',(event)=>{const data=event.data;if(data&&data.type===${JSON.stringify(
    messageType
  )}){event.waitUntil(cacheCurrentStaticAssets(data.hrefs));}});`
}

// Offline navigations use a generated, app-local service worker for the
// document fallback and the bootstrap assets referenced by that fallback. It is
// network-first for regular document loads; the client bootstrap owns route
// data after the fallback document loads.
export function createOfflineNavigationServiceWorker({
  cacheNamespace,
  fallbackAssetHrefs,
  fallbackDocumentHref,
}: {
  cacheNamespace: string
  fallbackAssetHrefs: string[]
  fallbackDocumentHref: string
}): string {
  return [
    renderServiceWorkerMetadata({
      cacheNamespace,
      fallbackAssetHrefs,
      fallbackDocumentHref,
    }),
    cachePrefixSource,
    hrefNormalizationSource,
    requiredResourceCachingSource,
    assetCacheKeySource,
    staticAssetFetchSource,
    currentAssetPromotionSource,
    renderDocumentNavigationSource(OFFLINE_NAVIGATION_FALLBACK_SERVED),
    installAndActivateListenersSource,
    fetchListenerSource,
    renderMessageListener(OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS),
  ].join('')
}
