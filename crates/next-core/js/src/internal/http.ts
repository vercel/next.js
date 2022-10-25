import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Shim for Node.js's http.ServerResponse
 *
 * @type {ServerResponse}
 */
export class ServerResponseShim {
  headersSent = false;
  #headers: Map<string, number | string | ReadonlyArray<string>> = new Map();
  req: IncomingMessage;

  constructor(req: IncomingMessage) {
    this.req = req;
  }

  setHeader(name: string, value: number | string | ReadonlyArray<string>) {
    this.#headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name: string) {
    return this.#headers.get(name.toLowerCase());
  }

  getHeaderNames() {
    return Array.from(this.#headers.keys());
  }

  getHeaders() {
    return Object.fromEntries(this.#headers);
  }

  hasHeader(name: string) {
    return this.#headers.has(name.toLowerCase());
  }

  removeHeader(name: string) {
    this.#headers.delete(name.toLowerCase());
  }

  get statusCode() {
    throw new Error("statusCode is not implemented");
  }

  set statusCode(code) {
    throw new Error("set statusCode is not implemented");
  }

  get statusMessage() {
    throw new Error("statusMessage is not implemented");
  }

  set statusMessage(message) {
    throw new Error("set statusMessage is not implemented");
  }

  get socket() {
    throw new Error("socket is not implemented");
  }

  get sendDate() {
    throw new Error("sendDate is not implemented");
  }

  flushHeaders() {
    throw new Error("flushHeaders is not implemented");
  }

  end() {
    throw new Error("end is not implemented");
  }

  cork() {
    throw new Error("cork is not implemented");
  }

  uncork() {
    throw new Error("uncork is not implemented");
  }

  addTrailers() {
    throw new Error("addTrailers is not implemented");
  }

  setTimeout(_msecs: any, _callback: any) {
    throw new Error("setTimeout is not implemented");
  }

  get writableEnded() {
    throw new Error("writableEnded is not implemented");
  }

  get writableFinished() {
    throw new Error("writableFinished is not implemented");
  }

  write(_chunk: any, _encoding: any, _callback: any) {
    throw new Error("write is not implemented");
  }

  writeContinue() {
    throw new Error("writeContinue is not implemented");
  }

  writeHead(_statusCode: any, _statusMessage: any, _headers: any) {
    throw new Error("writeHead is not implemented");
  }

  writeProcessing() {
    throw new Error("writeProcessing is not implemented");
  }
}
