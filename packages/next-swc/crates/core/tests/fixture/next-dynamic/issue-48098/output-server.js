import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(null, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "../text-dynamic-no-ssr-server"
        ]
    },
    ssr: false
});
