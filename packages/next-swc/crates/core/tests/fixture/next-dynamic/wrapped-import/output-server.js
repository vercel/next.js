import dynamic from 'next/dynamic';
const DynamicComponent = dynamic(async ()=>{
    typeof require.resolveWeak !== "undefined" && require.resolveWeak("./components/hello");
}, {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "./components/hello"
        ]
    },
    loading: ()=>null,
    ssr: false
});
