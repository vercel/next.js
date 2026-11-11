import{test,afterAll}from'vitest'
import{appendFileSync}from'node:fs'
const record=event=>appendFileSync(process.env.GETTER_TRACE,JSON.stringify({event})+'\n')
const error=new Error('owned getter error'),stack=error.stack;for(const[key,value]of[['message','owned getter error'],['name','Error'],['stack',stack]])Object.defineProperty(error,key,{configurable:true,get(){record('error-'+key);return value}});test('body',()=>record('body'));afterAll(()=>{throw error})
