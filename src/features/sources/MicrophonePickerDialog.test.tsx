import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MicrophonePickerDialog } from "./MicrophonePickerDialog";

afterEach(cleanup);
const device = { id: "usb", name: "USB microphone", isDefault: false, sampleRate: 48000, channels: 1 };
const props = () => ({ devices: [device], loading: false, active: false, previewMode: false, onClose: vi.fn(), onRefresh: vi.fn(), onSelect: vi.fn(async (_id?: string) => {}) });

describe("microphone selection", () => {
  it("blocks every device change while push-to-talk is active", () => {
    const p = props();
    render(<MicrophonePickerDialog {...p} active />);
    expect(screen.getByRole("button", { name: /USB microphone/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ใช้ไมค์เริ่มต้น/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /USB microphone/ }));
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("ปล่อยปุ่มพูดก่อนเปลี่ยนไมโครโฟน")).toBeVisible();
  });

  it("keeps selection errors visible and permits an explicit retry", async () => {
    const p = props();
    p.onSelect.mockRejectedValueOnce(new Error("ไมโครโฟนที่เลือกหายไป"));
    render(<MicrophonePickerDialog {...p} selectedId="usb" />);
    fireEvent.click(screen.getByRole("button", { name: /USB microphone/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ไมโครโฟนที่เลือกหายไป");
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /ใช้ไมค์เริ่มต้น/ }));
    await waitFor(() => expect(p.onSelect).toHaveBeenLastCalledWith(undefined));
  });

  it("reports no devices without silently selecting a replacement", () => {
    const p = props();
    render(<MicrophonePickerDialog {...p} devices={[]} selectedId="missing" />);
    expect(screen.getByText(/ยังไม่พบไมโครโฟน ตรวจ/)).toBeVisible();
    expect(screen.getByRole("button", { name: /ใช้ไมค์เริ่มต้น/ })).toHaveAttribute("aria-pressed", "false");
    expect(p.onSelect).not.toHaveBeenCalled();
  });
});
