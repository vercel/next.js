"TURBOPACK { transition: next-client-chunks }";
import id, { chunks as chunks } from "../components/hello1";
"TURBOPACK { transition: next-client-chunks }";
import id1, { chunks as chunks1 } from "../components/hello2";
import dynamic1 from 'next/dynamic';
import dynamic2 from 'next/dynamic';
const DynamicComponent1 = dynamic1(()=>import('../components/hello1'), {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id,
                chunks: chunks
            })
        ]
    }
});
const DynamicComponent2 = dynamic2(()=>import('../components/hello2'), {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id1,
                chunks: chunks1
            })
        ]
    }
});
