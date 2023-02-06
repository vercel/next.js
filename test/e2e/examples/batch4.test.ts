import { getExamplesBatch } from './getExamples'
import { testExample } from './testExample'

getExamplesBatch(4).forEach(testExample)
