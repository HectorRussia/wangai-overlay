import Image from "next/image";
export function Brand() {
  return (
    <span className="brand">
      <Image src="/images/wangai-icon.png" alt="" width={38} height={38} />
      <span>
        ว่าไง<span className="brand-dot">.</span>
      </span>
      <span className="brand-latin">WANGAI</span>
    </span>
  );
}
