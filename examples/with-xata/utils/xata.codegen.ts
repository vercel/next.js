import {
  BaseClientOptions,
  buildClient,
  SchemaInference,
  XataRecord,
} from "@xata.io/client";

const tables = [
  {
    name: "nextjs_with_xata_example",
    columns: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "url", type: "string" },
    ],
  },
] as const;

export type SchemaTables = typeof tables;
export type DatabaseSchema = SchemaInference<SchemaTables>;

export type NextjsWithXataExample = DatabaseSchema["nextjs_with_xata_example"];
export type NextjsWithXataExampleRecord = NextjsWithXataExample & XataRecord;

const DatabaseClient = buildClient();

const defaultOptions = {};

export class XataClient extends DatabaseClient<SchemaTables> {
  constructor(options?: BaseClientOptions) {
    super({ ...defaultOptions, ...options }, tables);
  }
}

let instance: XataClient | undefined = undefined;
export const getXataClient = () => {
  if (instance) return instance;

  instance = new XataClient();
  return instance;
};
