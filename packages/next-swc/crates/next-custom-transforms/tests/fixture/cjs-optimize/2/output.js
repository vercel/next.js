'use strict';
const Response = require("next/server/response").Response;
Object.defineProperty(exports, '__esModule', {
    value: true
});
;
const createResponse = (...args)=>{
    return new Response(...args);
};
