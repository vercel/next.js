import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(async ()=>{
    typeof require.resolveWeak !== "undefined" && require.resolveWeak("../text-dynamic-no-ssr-server");
}, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../text-dynamic-no-ssr-server"
        ]
    },
    ssr: false
});
