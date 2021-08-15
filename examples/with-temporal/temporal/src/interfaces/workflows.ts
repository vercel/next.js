import { Workflow } from '@temporalio/workflow'

// Extend the generic Workflow interface to check that Example is a valid workflow interface
// Workflow interfaces are useful for generating type safe workflow clients
export interface Example extends Workflow {
  main(name: string): Promise<string>
}
