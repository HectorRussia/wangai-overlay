import { describe, expect, it } from "vitest";
import { displayShortcut, shortcutFromKeydown } from "./hotkeyCapture";

describe("hotkey recording", () => {
  it("converts physical key presses to Tauri shortcut syntax", () => {
    expect(shortcutFromKeydown({ code: "F8", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe("F8");
    expect(shortcutFromKeydown({ code: "KeyK", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBe("Ctrl+Alt+KeyK");
    expect(shortcutFromKeydown({ code: "Digit4", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false })).toBe("Shift+Digit4");
    expect(shortcutFromKeydown({ code: "ControlLeft", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBeUndefined();
    expect(shortcutFromKeydown({ code: "Unidentified", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeUndefined();
  });

  it("accepts function keys from accessibility input when the physical code is unavailable", () => {
    expect(shortcutFromKeydown({ code: "Unidentified", key: "F9", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe("F9");
    expect(shortcutFromKeydown({ code: "Unidentified", key: "Dead", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBeUndefined();
  });

  it("shows readable key names without changing the stored shortcut", () => {
    expect(displayShortcut("Ctrl+Alt+KeyK")).toBe("Ctrl + Alt + K");
    expect(displayShortcut("F9")).toBe("F9");
    expect(displayShortcut("Mouse4")).toBe("Mouse4");
    expect(displayShortcut("Mouse5")).toBe("Mouse5");
  });
});
