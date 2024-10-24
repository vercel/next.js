import Image from "next/image";

export default function Logo() {
  return (
    <Image
      src="data:image/png;base64,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"
      alt="Logo"
      width={223}
      height={196}
      style={{
        margin: 10,
      }}
    />
  );
}
