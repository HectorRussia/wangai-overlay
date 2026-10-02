import Image from "next/image";

export function Brand() {
  return (
    <span className="brand">
      <Image src="/images/wangai-icon.png" alt="" width={34} height={34} />
      <span>
        wangai<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
