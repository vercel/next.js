/* tslint:disable */
import React from 'react'

declare namespace LoadableExport {
  interface ILoadable {
    <P = {}>(opts: any): React.ComponentClass<P>
    Map<P = {}>(opts: any): React.ComponentType<P>
    preloadAll(): Promise<any>
  }
}

declare const LoadableExport: LoadableExport.ILoadable;

export = LoadableExport
