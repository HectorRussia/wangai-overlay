import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AudioWaveform, audioLevel } from "./AudioWaveform";

afterEach(cleanup);

describe("live audio waveform", () => {
  it("maps digital silence to zero and louder captured sound to taller bars", () => {
    expect(audioLevel(-96, -96)).toBe(0);
    expect(audioLevel(-25, -10)).toBeGreaterThan(audioLevel(-50, -42));
    expect(audioLevel(undefined, -10)).toBe(0);
  });

  it("updates only from capture samples and clears when capture stops", () => {
    const view = render(<AudioWaveform label="ระดับเสียงไมโครโฟน" active rmsDbfs={-25} peakDbfs={-10} sampleAt={1000} />);
    const meter = screen.getByRole("meter", { name: "ระดับเสียงไมโครโฟน" });
    expect(meter).toHaveAttribute("aria-valuenow", String(Math.round(audioLevel(-25, -10) * 100)));
    expect(meter.lastElementChild).toHaveStyle({ height: `${4 + Math.round(audioLevel(-25, -10) * 24)}px` });
    view.rerender(<AudioWaveform label="ระดับเสียงไมโครโฟน" active rmsDbfs={-50} peakDbfs={-42} sampleAt={1200} />);
    expect(meter.lastElementChild).toHaveStyle({ height: `${4 + Math.round(audioLevel(-50, -42) * 24)}px` });
    view.rerender(<AudioWaveform label="ระดับเสียงไมโครโฟน" active={false} rmsDbfs={-25} peakDbfs={-10} sampleAt={1200} />);
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect([...meter.children].every((bar) => (bar as HTMLElement).style.height === "4px")).toBe(true);
  });
});
