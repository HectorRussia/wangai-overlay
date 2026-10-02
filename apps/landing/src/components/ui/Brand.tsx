import { AudioLines } from "lucide-react";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <AudioLines size={23} aria-hidden="true" />
      </span>
      <span>
        ว่าไง<span className="brand-dot">.</span>
      </span>
      <span className="brand-latin">WANGAI</span>
    </span>
  );
}
