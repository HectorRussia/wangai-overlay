type Props = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
  inputClassName?: string;
};

export function Slider({ label, min, max, step, value, display, onChange, inputClassName = "mt-3 w-full" }: Props) {
  return <label className="text-sm">
    <span className="flex justify-between"><span>{label}</span><strong className="settings-value">{display}</strong></span>
    <input className={inputClassName} min={min} max={max} step={step} type="range" value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}
