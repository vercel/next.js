import { test, expect, vi } from 'vitest'
import { types } from 'node:util'
const shape=value=>{if(value===null||(typeof value!=='object'&&typeof value!=='function'))return{type:typeof value,value};return{type:typeof value,brand:types.isModuleNamespaceObject(value),tag:value[Symbol.toStringTag]??null,keys:Reflect.ownKeys(value).map(String),prototype:Object.getPrototypeOf(value)===null?'null':Object.getPrototypeOf(value)===Object.prototype?'Object.prototype':Object.getPrototypeOf(value)===Function.prototype?'Function.prototype':'other',extensible:Object.isExtensible(value),sealed:Object.isSealed(value),frozen:Object.isFrozen(value),descriptors:Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key);return{key:String(key),valueType:typeof d.value,get:typeof d.get,set:typeof d.set,writable:d.writable??null,enumerable:d.enumerable,configurable:d.configurable}})}}
const same=values=>values.map(x=>values.map(y=>x===y))
const view=ns=>{const ownDefault=Object.hasOwn(ns,'default'),root=ownDefault?ns.default:null;return{namespace:shape(ns),default:root?shape(root):null,value:ns.value,phase:ns.phase,fn:shape(ns.fn),fnName:ns.fn?.name,fnLength:ns.fn?.length,namedCall:typeof ns.fn==='function'?ns.fn('named'):null,defaultFnSame:root&&typeof root.fn==='function'?ns.fn===root.fn:null,defaultCall:root&&typeof root.fn==='function'?root.fn('default'):null}}
const row=(label,value)=>console.log('MOCKPAIR:'+JSON.stringify({label,...value}))

vi.mock('next-test-native-cuts-b',function(){globalThis.__nativeCutsBStatic1=(globalThis.__nativeCutsBStatic1??0)+1;return{value:25,phase:'b-static-25',fn(value){return['b-static-25',value]}}})
vi.unmock('next-test-native-cuts-a')
vi.mock('next-test-native-cuts-a',()=>{globalThis.__nativeCutsAStatic1=(globalThis.__nativeCutsAStatic1??0)+1;return{value:15,phase:'a-static-15',fn(value){return['a-static-15',value]}}})
vi.mock('next-test-native-cuts-b',function(){globalThis.__nativeCutsBStatic2=(globalThis.__nativeCutsBStatic2??0)+1;return{value:29,phase:'b-static-29',fn(value){return['b-static-29',value]}}})
vi.mock('next-test-native-cuts-a',()=>{globalThis.__nativeCutsAStatic2=(globalThis.__nativeCutsAStatic2??0)+1;return{value:19,phase:'a-static-19',fn(value){return['a-static-19',value]}}})
vi.unmock('next-test-native-cuts-b')

import * as staticA from 'next-test-native-cuts-a'
import * as staticB from 'next-test-native-cuts-b'
const cycleView=ns=>{const root=Object.hasOwn(ns,'default')?ns.default:null,dependency=root?.dependency;return{...view(ns),rootEvaluation:root?.evaluation??null,dependency:dependency?shape(dependency):null,dependencyEvaluation:dependency?.evaluation??null,backedgeSame:dependency?dependency.root===root:null,backedgeFunctionSame:dependency?dependency.root.fn===root.fn:null,rootHadFunctionDuringCycle:dependency?.rootHadFunctionDuringCycle??null}}

test('retains two independent native targets through ordered cuts runtime actual reset and cache',async()=>{
 let callsA=0,callsB=0,originalA,originalB
 const beforeA=await import('next-test-native-cuts-a'),beforeB=await import('next-test-native-cuts-b')
 vi.doMock('next-test-native-cuts-a',async importOriginal=>{callsA++;originalA=await importOriginal();return{value:73,phase:'a-runtime',fn(value){return['a-runtime',value]}}})
 vi.doMock('next-test-native-cuts-b',async function(importOriginal){callsB++;originalB=await importOriginal();return{value:83,phase:'b-runtime',fn(value){return['b-runtime',value]}}})
 const runtimeA=await import('next-test-native-cuts-a'),runtimeB=await import('next-test-native-cuts-b')
 const cachedA=await import('next-test-native-cuts-a'),cachedB=await import('next-test-native-cuts-b')
 const actualA=await vi.importActual('next-test-native-cuts-a'),actualB=await vi.importActual('next-test-native-cuts-b')
 vi.resetModules()
 const afterResetA=await import('next-test-native-cuts-a'),afterResetB=await import('next-test-native-cuts-b')
 const actualAfterA=await vi.importActual('next-test-native-cuts-a'),actualAfterB=await vi.importActual('next-test-native-cuts-b')
 vi.doUnmock('next-test-native-cuts-a')
 const unmockedA=await import('next-test-native-cuts-a'),stillMockedB=await import('next-test-native-cuts-b')
 vi.doUnmock('next-test-native-cuts-b')
 const unmockedB=await import('next-test-native-cuts-b')
 vi.resetModules()
 const finalA=await import('next-test-native-cuts-a'),finalB=await import('next-test-native-cuts-b')
 const a=[staticA,beforeA,runtimeA,cachedA,actualA,afterResetA,actualAfterA,unmockedA,finalA]
 const b=[staticB,beforeB,runtimeB,cachedB,actualB,afterResetB,actualAfterB,stillMockedB,unmockedB,finalB]
 const all=[...a,...b],defaults=all.map(x=>Object.hasOwn(x,'default')?x.default:null)
 row('two-native-targets',{layout:"a-survives-b-cancelled",stagesA:['static','before','runtime','cached','actual','reset','actual-reset','unmock','final-reset'],stagesB:['static','before','runtime','cached','actual','reset','actual-reset','after-a-unmock','unmock','final-reset'],a:a.map(cycleView),b:b.map(cycleView),identities:same(all),functions:same(all.map(x=>x.fn)),defaultIdentities:same(defaults),originalAIdentity:all.map(x=>x===originalA),originalBIdentity:all.map(x=>x===originalB),calls:{a:callsA,b:callsB},counts:{a:{root:globalThis.__nativeCutsARoot??0,dependency:globalThis.__nativeCutsADependency??0,static1:globalThis.__nativeCutsAStatic1??0,static2:globalThis.__nativeCutsAStatic2??0},b:{root:globalThis.__nativeCutsBRoot??0,dependency:globalThis.__nativeCutsBDependency??0,static1:globalThis.__nativeCutsBStatic1??0,static2:globalThis.__nativeCutsBStatic2??0}}})
 expect(staticA.value).toBe(19);expect(staticB.value).toBe(40)
 expect(runtimeA.value).toBe(73);expect(runtimeB.value).toBe(83)
 expect(actualA.value).toBe(30);expect(actualB.value).toBe(40)
 expect(afterResetA.value).toBe(73);expect(afterResetB.value).toBe(83)
 expect(actualAfterA.value).toBe(30);expect(actualAfterB.value).toBe(40)
 expect(unmockedA.value).toBe(30);expect(stillMockedB.value).toBe(83);expect(unmockedB.value).toBe(40)
 expect(finalA.value).toBe(30);expect(finalB.value).toBe(40)
 expect(actualA.default.dependency.root).toBe(actualA.default);expect(actualB.default.dependency.root).toBe(actualB.default)
 expect(actualA.default).not.toBe(actualB.default);expect(callsA).toBe(1);expect(callsB).toBe(1)
})
