// Keep browser-only interactions out of the desktop window. Form and dialog
// keyboard controls remain available, including copy/paste and focus traps.
export function installDesktopInput(window) {
  if (!window.__TAURI_INTERNALS__) return () => {};
  const document = window.document;
  const contextMenu = event => event.preventDefault();
  const keyDown = event => {
    const key = event.key.toLowerCase();
    const inspect = key === 'f12' ||
      (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(key));
    const keyboardControl = event.target?.closest?.(
      'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="combobox"],[role="listbox"]'
    );
    const editable = event.target?.closest?.('input,textarea,[contenteditable="true"]');
    const selectPage = key === 'a' && (event.ctrlKey || event.metaKey) && !editable;
    if (inspect || selectPage || (key === 'tab' && !keyboardControl)) event.preventDefault();
  };
  document.addEventListener('contextmenu', contextMenu, true);
  document.addEventListener('keydown', keyDown, true);
  return () => {
    document.removeEventListener('contextmenu', contextMenu, true);
    document.removeEventListener('keydown', keyDown, true);
  };
}
