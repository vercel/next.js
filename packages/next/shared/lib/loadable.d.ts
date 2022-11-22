/* tslint:disable */
import React from 'react'

declare namespace LoadableExport {
  interface ILoadable {
    <P = {}>(opts: any): React.ComponentClass<P>
    Map<P = {}>(opts: any): React.ComponentType<P>
    preloadAll(): Promise<any>
  }
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
declare const LoadableExport: LoadableExport.ILoadable

export = LoadableExport
