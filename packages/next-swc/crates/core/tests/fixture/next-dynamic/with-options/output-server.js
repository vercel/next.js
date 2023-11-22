import dynamic from 'next/dynamic';
const DynamicComponentWithCustomLoading = dynamic(()=>import('../components/hello'), {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    },
    loading: ()=><p>...</p>
});
const DynamicClientOnlyComponent = dynamic(async ()=>{
    typeof require.resolveWeak !== "undefined" && require.resolveWeak("../components/hello");
}, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    },
    ssr: false
});
const DynamicClientOnlyComponentWithSuspense = dynamic(async ()=>{
    typeof require.resolveWeak !== "undefined" && require.resolveWeak("../components/hello");
}, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../components/hello"
        ]
    },
    ssr: false,
    suspense: true
});
