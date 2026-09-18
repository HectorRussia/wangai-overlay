import { Component, lazy, Suspense, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { isPreviewMode } from "./preview";

const LiquidGlass = lazy(() => import("liquid-glass-react"));
const stationary = { x: 0, y: 0 };
class EffectBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** CSS ships until the Fixed WebView2/performance gate passes. Evaluate the
 * pinned library with ?preview=1&glass=liquid. Effects never own controls or
 * startup readiness, require no CSP exceptions and do not persist settings. */
export function GlassSurface({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  const surface = useRef<HTMLDivElement>(null);
  const [effect, setEffect] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!isPreviewMode() || params.get("glass") !== "liquid"
      || !window.matchMedia || !window.IntersectionObserver || typeof CSS === "undefined" || !CSS.supports("backdrop-filter", "blur(1px)")) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const contrast = matchMedia("(forced-colors: active)");
    let visible = false;
    const update = () => setEffect(visible && !document.hidden && !motion.matches && !contrast.matches);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    if (surface.current) observer.observe(surface.current);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    contrast.addEventListener("change", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      contrast.removeEventListener("change", update);
    };
  }, []);
  return <div {...props} ref={surface} className={`glass-surface ${className}`} data-glass={effect ? "liquid" : "css"}>
    {effect && <div className="glass-effect" aria-hidden="true"><EffectBoundary><Suspense fallback={null}>
      <LiquidGlass mode="standard" elasticity={0} displacementScale={12} blurAmount={0.08} saturation={105}
        aberrationIntensity={0} cornerRadius={24} globalMousePos={stationary} mouseOffset={stationary}
        padding="0" style={{ width: "100%", height: "100%" }}><span /></LiquidGlass>
    </Suspense></EffectBoundary></div>}
    {children}
  </div>;
}
