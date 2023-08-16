"TURBOPACK { transition: next-client-chunks }";
import id, { chunks as chunks } from "../components/hello";
"TURBOPACK { transition: next-client-chunks }";
import id1, { chunks as chunks1 } from "../components/hello";
"TURBOPACK { transition: next-client-chunks }";
import id2, { chunks as chunks2 } from "../components/hello";
import dynamic from 'next/dynamic';
const DynamicComponentWithCustomLoading = dynamic(()=>import('../components/hello'), {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id,
                chunks: chunks
            })
        ]
    },
    loading: ()=><p >...</p>
});
const DynamicClientOnlyComponent = dynamic(null, {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id1,
                chunks: chunks1
            })
        ]
    },
    ssr: false
});
const DynamicClientOnlyComponentWithSuspense = dynamic(()=>import('../components/hello'), {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id2,
                chunks: chunks2
            })
        ]
    },
    ssr: false,
    suspense: true
});
