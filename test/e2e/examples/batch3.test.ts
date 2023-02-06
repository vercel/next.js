import { getExamplesBatch } from './getExamples'
import { testExample } from './testExample'

getExamplesBatch(3).forEach(testExample)
