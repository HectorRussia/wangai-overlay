import Image from "next/image";
export function Brand() {
  return (
    <span className="brand">
      <Image src="/images/wangai-icon.png" alt="" width={38} height={38} />
      <span className="brand-wordmark">WANGAI</span>
    </span>
  );
}
