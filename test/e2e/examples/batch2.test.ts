import { getExamplesBatch } from './getExamples'
import { testExample } from './testExample'

getExamplesBatch(2).forEach(testExample)
