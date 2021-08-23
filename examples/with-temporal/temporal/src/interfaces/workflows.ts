import { Workflow } from '@temporalio/workflow'

export interface Order extends Workflow {
  main(userId: string, itemId: string, quantity: number): Promise<string>
}
