import dynamic from 'next/dynamic';
export const NextDynamicNoSSRServerComponent = dynamic(()=>import('../text-dynamic-no-ssr-server'), {
    loadableGenerated: {
        webpack: ()=>[
                require.resolveWeak("../text-dynamic-no-ssr-server")
            ]
    },
    ssr: false
});
