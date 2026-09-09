import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessPickerDialog } from "./ProcessPickerDialog";
import { previewRunningApps } from "./preview";
import type { RunningApp } from "./types";

const appFixture = (): RunningApp => ({ ...previewRunningApps[1], processCount: 6, memberPids: [7210, 7211, 7212, 7213, 7214, 7215] });
const props = () => ({ apps: [appFixture()], loading: false, previewMode: false, onClose: vi.fn(), onRefresh: vi.fn(), onSelect: vi.fn().mockResolvedValue(undefined) });
afterEach(cleanup);

describe("grouped running app picker", () => {
  it("shows one Discord row and selects its root", async () => {
    const p = props(); render(<ProcessPickerDialog {...p} />);
    expect(screen.getAllByText("Discord")).toHaveLength(1);
    expect(screen.queryByText("แนะนำ")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Discord.exe · 6 processes/ }));
    await waitFor(() => expect(p.onSelect).toHaveBeenCalledWith(p.apps[0].roots[0]));
  });

  it("searches metadata and executable aliases beyond the former 40 row limit", () => {
    const p = props();
    p.apps = Array.from({ length: 55 }, (_, i) => ({ ...appFixture(), id: `app-${i}`, displayName: `App ${i}`, searchNames: [`hidden-${i}.exe`, `Product ${i}`] }));
    render(<ProcessPickerDialog {...p} />);
    expect(screen.getByText("App 54")).toBeInTheDocument();
    const search = screen.getByRole("textbox");
    fireEvent.change(search, { target: { value: "Product 54" } });
    expect(screen.getByText("App 54")).toBeInTheDocument();
    expect(screen.queryByText("App 0")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "hidden-54.exe" } });
    expect(screen.getByText("App 54")).toBeInTheDocument();
  });

  it("keeps selected app and search focus across PID changes and refresh", () => {
    const p = props();
    const selected = { executablePath: p.apps[0].executablePath, executableName: p.apps[0].executableName, displayName: "Discord", lastPid: 999 };
    const view = render(<ProcessPickerDialog {...p} selected={selected} />);
    const search = screen.getByRole("textbox");
    fireEvent.change(search, { target: { value: "discord" } });
    view.rerender(<ProcessPickerDialog {...p} selected={selected} loading onClose={vi.fn()} />);
    expect(search).toHaveFocus(); expect(search).toHaveValue("discord");
    expect(screen.getByRole("button", { name: /Discord.exe · 6 processes/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("returns to the top when changing or clearing a search in a long list", () => {
    const p = props();
    p.apps = [previewRunningApps[0], ...Array.from({ length: 50 }, (_, i) => ({
      ...appFixture(), id: `system-${i}`, displayName: `Microsoft App ${i}`,
      searchNames: [`Microsoft App ${i}`],
    }))];
    const view = render(<ProcessPickerDialog {...p} />);
    const list = view.container.querySelector<HTMLDivElement>(".process-dialog-list")!;
    const search = screen.getByRole("textbox");
    for (const query of ["Mi", "Mistfall", ""]) {
      list.scrollTop = 1200;
      fireEvent.change(search, { target: { value: query } });
      expect(list.scrollTop).toBe(0);
      expect(search).toHaveFocus();
      expect(screen.getByText("Mistfall Hunter")).toBeInTheDocument();
    }
  });

  it("does not reset the user's scroll position on background refresh", () => {
    const p = props();
    const view = render(<ProcessPickerDialog {...p} />);
    const search = screen.getByRole("textbox");
    fireEvent.change(search, { target: { value: "discord" } });
    const list = view.container.querySelector<HTMLDivElement>(".process-dialog-list")!;
    list.scrollTop = 420;
    view.rerender(<ProcessPickerDialog {...p} loading />);
    view.rerender(<ProcessPickerDialog {...p} apps={p.apps.map((app) => ({ ...app }))} />);
    expect(list.scrollTop).toBe(420);
    expect(search).toHaveFocus();
    expect(search).toHaveValue("discord");
  });

  it("requires choosing an instance when multiple independent roots exist", async () => {
    const p = props(); p.apps[0].roots = [p.apps[0].roots[0], { ...p.apps[0].roots[0], pid: 8123 }];
    render(<ProcessPickerDialog {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Discord.exe · 6 processes/ }));
    expect(p.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "เลือก instance 8123" }));
    await waitFor(() => expect(p.onSelect).toHaveBeenCalledWith(p.apps[0].roots[1]));
  });

  it("keeps the picker open and displays a stale selection error", async () => {
    const p = props(); p.onSelect.mockRejectedValue(new Error("แอปปิดแล้ว"));
    render(<ProcessPickerDialog {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Discord.exe · 6 processes/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("แอปปิดแล้ว");
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it("shows discovery errors and restores focus after Escape", async () => {
    const opener = document.createElement("button"); document.body.append(opener); opener.focus();
    const p = props();
    const view = render(<ProcessPickerDialog {...p} error="อ่านรายการไม่สำเร็จ" />);
    expect(screen.getByRole("alert")).toHaveTextContent("อ่านรายการไม่สำเร็จ");
    const close = screen.getByRole("button", { name: "ปิดหน้าต่างเลือกแอป" }); close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "รายละเอียด Discord" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" }); expect(p.onClose).toHaveBeenCalledOnce();
    await act(async () => view.unmount()); expect(opener).toHaveFocus(); opener.remove();
  });
});
