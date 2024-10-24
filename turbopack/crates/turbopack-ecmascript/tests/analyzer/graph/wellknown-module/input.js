// source code
import path1 from 'path'
import path2 from 'node:path'
run(path1)
run(path2)

// what tree shaking might produce
import path3 from '__TURBOPACK_PART__' with { __turbopack_original__: 'path' }
import path4 from '__TURBOPACK_PART__' with { __turbopack_original__: 'node:path' }
run(path3)
run(path4)
