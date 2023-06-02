import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(()=>import('../text-dynamic-no-ssr-server'), {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../text-dynamic-no-ssr-server"
        ]
    },
    ssr: false
});
