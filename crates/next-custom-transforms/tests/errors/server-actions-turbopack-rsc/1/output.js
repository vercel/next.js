'use client';
'use strict';
import { registerServerReference } from "private-next-rsc-server-reference";
export const $$RSC_SERVER_ACTION_0 = async function action() {};
registerServerReference($$RSC_SERVER_ACTION_0, "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7", null);
__turbopack_emit__(null, {
    namespace: process.env.NEXT_RUNTIME === 'nodejs' ? 'next/server-actions/rsc-nodejs' : 'next/server-actions/rsc-edge',
    data: "006a88810ecce4a4e8b59d53b8327d7e98bbf251d7\0$$RSC_SERVER_ACTION_0\0/app/item.js"
});
export default function Page() {
    return <form action={$$RSC_SERVER_ACTION_0}/>;
}
