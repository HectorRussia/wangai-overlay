type KeyboardShortcutEvent = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"> & { key?: string };

const supportedKeys = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Numpad(?:[0-9]|Add|Decimal|Divide|Enter|Multiply|Subtract)|Arrow(?:Up|Down|Left|Right)|Backquote|Backslash|BracketLeft|BracketRight|Comma|Equal|Minus|Period|Quote|Semicolon|Slash|Space|Enter|Tab|Backspace|Delete|Home|End|Insert|PageUp|PageDown|Pause|PrintScreen|ScrollLock)$/;

export function shortcutFromKeydown(event: KeyboardShortcutEvent): string | undefined {
  let code = event.code;
  if (!supportedKeys.test(code)) {
    const key = event.key ?? "";
    code = /^F(?:[1-9]|1[0-2])$/.test(key) ? key
      : /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}`
      : /^[0-9]$/.test(key) ? `Digit${key}`
      : key === " " ? "Space"
      : key;
  }
  if (!supportedKeys.test(code)) return undefined;
  return [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
    code,
  ].filter(Boolean).join("+");
}

export function displayShortcut(value: string): string {
  return value.split("+").map((part) => {
    if (part === "Ctrl" || part === "Control") return "Ctrl";
    if (part === "Alt") return "Alt";
    if (part === "Shift") return "Shift";
    if (part === "Super") return "Win";
    if (part.startsWith("Key")) return part.slice(3);
    if (part.startsWith("Digit")) return part.slice(5);
    return part;
  }).join(" + ");
}
