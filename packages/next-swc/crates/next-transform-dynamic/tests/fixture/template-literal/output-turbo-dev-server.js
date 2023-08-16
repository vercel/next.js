"TURBOPACK { transition: next-client-chunks }";
import id, { chunks as chunks } from "../components/hello";
import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(()=>import(`../components/hello`), {
    loadableGenerated: {
        modules: [
            JSON.stringify({
                id: id,
                chunks: chunks
            })
        ]
    }
});
const componentRoot = '@/some-components';
const Component1 = dynamic(()=>import(`${componentRoot}/component1`));
const Component2 = dynamic(()=>import(`${componentRoot}/component2`));
