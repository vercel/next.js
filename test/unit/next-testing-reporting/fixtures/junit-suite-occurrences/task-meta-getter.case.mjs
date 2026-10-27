import{test,afterAll}from'vitest'
import{appendFileSync}from'node:fs'
const record=event=>appendFileSync(process.env.GETTER_TRACE,JSON.stringify({event})+'\n')
test('body',context=>{record('body');Object.defineProperty(context.task.meta,'owned',{configurable:true,enumerable:true,get(){record('task-meta-owned');return 1}})})
