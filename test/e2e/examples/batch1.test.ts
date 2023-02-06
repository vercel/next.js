import { getExamplesBatch } from './getExamples'
import { testExample } from './testExample'

getExamplesBatch(1).forEach(testExample)
