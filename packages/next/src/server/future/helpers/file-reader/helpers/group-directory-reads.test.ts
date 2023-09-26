import {
  groupDirectoryReads,
  mergeDirectoryReadResults,
  DirectoryReadTask,
  GroupedDirectoryReadResult,
  GroupedDirectoryReadTask,
} from './group-directory-reads'

describe('groupDirectoryReads', () => {
  it('returns the grouped tasks', () => {
    const tasks: DirectoryReadTask[] = [
      { dir: '/some/directory1', recursive: true },
      { dir: '/some/directory2', recursive: false },
    ]
    const groupedTasks = groupDirectoryReads(tasks, '/')

    expect(groupedTasks).toBeDefined()
    expect(groupedTasks.length).toBe(2)
  })
})

describe('mergeDirectoryReadResults', () => {
  it('returns merge result', () => {
    const specs: GroupedDirectoryReadTask<DirectoryReadTask>[] = [
      { dir: 'directory1', recursive: true, shared: [], subDirectories: [] },
      { dir: 'directory2', recursive: false, shared: [], subDirectories: [] },
    ]

    const results: GroupedDirectoryReadResult<DirectoryReadTask>[] = [
      {
        dir: 'directory1',
        recursive: true,
        shared: [specs[0]],
        subDirectories: [],
        files: ['file1', 'file2'],
      },
      {
        dir: 'directory2',
        recursive: false,
        shared: [specs[1]],
        subDirectories: [],
        error: new Error('Error message'),
      },
    ]

    const result = mergeDirectoryReadResults(specs, results, '/')

    expect(result).toBeDefined()
    expect(result.length).toBe(2)
    expect(result[1]).toBeInstanceOf(Error)
  })
})

describe('integration', () => {
  it('will group and merge tasks', () => {
    const tasks: DirectoryReadTask[] = [
      { dir: '/some/directory1', recursive: true },
      { dir: '/some/directory2', recursive: false },
    ]

    const groupedTasks = groupDirectoryReads(tasks, '/')

    const specs: GroupedDirectoryReadTask<DirectoryReadTask>[] = [
      { dir: 'directory1', recursive: true, shared: [], subDirectories: [] },
      { dir: 'directory2', recursive: false, shared: [], subDirectories: [] },
    ]

    const results: GroupedDirectoryReadResult<DirectoryReadTask>[] = [
      {
        dir: '/some/directory1',
        recursive: true,
        shared: [specs[0]],
        subDirectories: [],
        files: ['file1', 'file2'],
      },
      {
        dir: '/some/directory2',
        recursive: false,
        shared: [specs[1]],
        subDirectories: [],
        error: new Error('Error message'),
      },
    ]

    const mergedResults = mergeDirectoryReadResults(specs, results, '/')

    expect(groupedTasks).toBeDefined()
    expect(groupedTasks.length).toBe(2)
    expect(mergedResults).toBeDefined()
    expect(mergedResults.length).toBe(2)
    expect(mergedResults[1]).toBeInstanceOf(Error)
  })

  it('will group and merge tasks with overlapping', () => {
    const tasks: DirectoryReadTask[] = [
      { dir: '/some/directory1', recursive: true },
      { dir: '/some/directory1/subdirectory', recursive: false },
    ]

    const groupedTasks = groupDirectoryReads(tasks, '/')

    expect(groupedTasks).toBeDefined()
    expect(groupedTasks.length).toBe(1)
    expect(groupedTasks[0].subDirectories).toHaveLength(1)
    expect(groupedTasks[0].subDirectories[0]).toBe(tasks[1])

    const [groupedTask] = groupedTasks

    const results: GroupedDirectoryReadResult<DirectoryReadTask>[] = [
      {
        ...groupedTask,
        files: [
          '/some/directory1/file.js',
          '/some/directory1/page.ts',
          '/some/directory1/route.ts',
          '/some/directory1/subdirectory/route.ts',
          '/some/directory1/subdirectory/deeper/route.ts',
        ],
      },
    ]

    const mergedResults = mergeDirectoryReadResults(tasks, results, '/')

    expect(mergedResults).toBeDefined()
    expect(mergedResults.length).toBe(2)

    expect(mergedResults[0]).toBeDefined()
    expect(mergedResults[0]).toBeInstanceOf(Array)
    expect((mergedResults[0] as string[]).length).toBe(5)

    expect(mergedResults[1]).toBeDefined()
    expect(mergedResults[1]).toBeInstanceOf(Array)
    expect((mergedResults[1] as string[]).length).toBe(1)
  })
})
