export interface Paths {
  read: Set<string>
  checked: Set<string>
}

export interface Address {
  addr: string
  port: string
}

export type EnvVars = Set<string | Symbol>
export type Addresses = Array<Address>

export type SerializableAccessProxy = {
  paths: {
    read: Array<string>
    checked: Array<string>
  }
  addresses: Addresses
  envVars: Array<string>
}

export type PublicAccessProxy = {
  accessedNetwork: boolean
  readEnvVarKeys: Array<string>
  paths: {
    read: Array<string>
    checked: Array<string>
  }
}
