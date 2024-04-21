/* eslint-disable import/no-extraneous-dependencies */
import { createClientModuleProxy } from 'next/dist/compiled/react-server-dom-webpack/server.edge'

// Re-assign to make it typed.
export const createProxy: (moduleId: string) => any = createClientModuleProxy
