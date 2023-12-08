import id, { chunks as chunks } from "./components/hello" with {
    "transition": "next-client-chunks"
};
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>handleImport(import('./components/hello')), {
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
