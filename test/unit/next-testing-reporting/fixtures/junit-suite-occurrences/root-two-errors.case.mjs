import{test,beforeAll,afterAll,describe}from'vitest'
import{appendFileSync}from'node:fs'
const record=event=>appendFileSync(process.env.HOOK_TRACE,JSON.stringify({event})+'\n')
record('module-enter');
const first=new Error('owned before error'),second=new Error('owned after error');beforeAll(()=>{record('before');throw first});afterAll(()=>{record('after');throw second});test('blocked',()=>record('BAD_BODY'));
