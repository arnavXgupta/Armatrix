const el = (t: EventTarget | null) => (t instanceof Element ? t : null)

/** Focus is in a control that uses plain keys itself (text, select, slider): leave letters and arrows alone. */
export const isTyping = (t: EventTarget | null) => !!el(t)?.closest('input, textarea, select, [contenteditable]')

/** Focus is in a text field, which has its own Ctrl+Z. Selects, sliders and checkboxes do not. */
export const isTextEntry = (t: EventTarget | null) =>
  !!el(t)?.closest('textarea, [contenteditable], input:not([type=range], [type=checkbox], [type=radio], [type=file], [type=button])')
