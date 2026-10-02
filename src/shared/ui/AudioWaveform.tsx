import { useEffect, useState } from "react";

const BAR_COUNT = 15;
const emptyWave = () => Array<number>(BAR_COUNT).fill(0);

export function audioLevel(rmsDbfs?: number | null, peakDbfs?: number | null): number {
  if (rmsDbfs == null || peakDbfs == null) return 0;
  const rms = Math.max(0, Math.min(1, (rmsDbfs + 58) / 42));
  const peak = Math.max(0, Math.min(1, (peakDbfs + 54) / 44));
  return Math.max(rms, peak * 0.7);
}

type Props = {
  label: string;
  active: boolean;
  rmsDbfs?: number | null;
  peakDbfs?: number | null;
  sampleAt?: number | null;
};

export function AudioWaveform({ label, active, rmsDbfs, peakDbfs, sampleAt }: Props) {
  const [history, setHistory] = useState(emptyWave);
  const level = active && sampleAt != null ? audioLevel(rmsDbfs, peakDbfs) : 0;

  useEffect(() => {
    if (!active || sampleAt == null || rmsDbfs == null || peakDbfs == null) {
      setHistory(emptyWave());
      return;
    }
    setHistory((previous) => [...previous.slice(1), level]);
  }, [active, sampleAt, rmsDbfs, peakDbfs, level]);

  return <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(level * 100)} className={`ready-waveform ${active && level > 0 ? "is-active" : ""}`} role="meter" title={`${label}: ${Math.round(level * 100)}%`}>
    {history.map((value, index) => <span key={index} style={{ height: `${4 + Math.round(value * 24)}px` }} />)}
  </div>;
}
