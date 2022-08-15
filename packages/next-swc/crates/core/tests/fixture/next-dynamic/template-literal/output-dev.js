import dynamic from "next/dynamic";
const Test = dynamic(()=>import(`/components/test`), {
    loadableGenerated: {
        modules: [
            "some-file.js -> " + "/components/test"
        ]
    }
});
