"TURBOPACK { transition: next-client-chunks }";
import id, { chunks as chunks } from "./components/hello";
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(null, {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id,
                chunks: chunks
            })
        ]
    },
    loading: ()=>null,
    ssr: false
});
