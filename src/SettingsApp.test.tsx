import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadyRoom } from "./ReadyRoom";
import { snapshotFixture } from "./test/fixtures";

describe("single-source Ready Room", () => {
  afterEach(cleanup);
  it("shows only the listening source and translation rows", () => {
    const snapshot = snapshotFixture();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} history={snapshot.history} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={vi.fn()} webRuntime={false} />);
    expect(screen.getByText("แหล่งเสียงที่ฟัง")).toBeInTheDocument();
    expect(screen.getByText("การแปล")).toBeInTheDocument();
    expect(screen.queryByText("Voice chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser media")).not.toBeInTheDocument();
  });

  it("uses one change action for every application", () => {
    const snapshot = snapshotFixture();
    const open = vi.fn();
    render(<ReadyRoom settings={snapshot.settings} runtime={snapshot.runtime} history={snapshot.history} previewMode={false} onToggleListening={vi.fn()} onOpenSourcePicker={open} webRuntime={false} />);
    fireEvent.click(screen.getByRole("button", { name: "เปลี่ยน" }));
    expect(open).toHaveBeenCalledOnce();
  });
});
