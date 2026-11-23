import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { controlGroups } from './controls.ts';
import type { ControlGroup } from './controls.ts';
import { takesTyping } from './keys.ts';

function Group({ title, note, controls }: ControlGroup) {
  return (
    <section class="help-group">
      <h3>{title}</h3>
      {note && <p class="help-note">{note}</p>}
      <dl class="help-list">
        {controls.map(({ keys, does }) => (
          <Fragment key={does}>
            <dt>
              {/* "or" between the ways is for a screen reader; on screen the keys stand apart. */}
              {keys.map((key, index) => (
                <Fragment key={key}>
                  {index > 0 && <span class="sr-only"> or </span>}
                  <kbd>{key}</kbd>
                </Fragment>
              ))}
            </dt>
            <dd>{does}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/**
 * The "?" control for the header and the dialog it opens, which lists controls.ts. A modal dialog: the focus goes in,
 * stays in, and goes back where it was when Escape or the control closes it. A click outside closes it too, leaving
 * the focus to what was clicked. Its keys are its own while it is open, so a walk does not move the page under it and
 * the popup's Escape is not taken with its own. `useHelp` holds whether it is open, for the two to share.
 */
export function useHelp() {
  const [open, setOpen] = useState(false);
  // Read by the page's listeners, which are added once and must see it as it is now.
  const isOpen = useRef(open);
  /** Where the focus goes back to when it closes. */
  const returnTo = useRef<HTMLElement | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const set = (value: boolean) => {
    isOpen.current = value;
    setOpen(value);
  };

  const show = () => {
    if (isOpen.current) return;
    // Nothing had the focus, as after a click on no control: the control that opens it is where it goes back to.
    const active = document.activeElement;
    returnTo.current =
      active instanceof HTMLElement && active !== document.body ? active : (button.current ?? undefined);
    set(true);
  };
  const close = (returnFocus = true) => {
    if (!isOpen.current) return;
    set(false);
    const back = returnTo.current?.isConnected ? returnTo.current : button.current;
    returnTo.current = undefined;
    if (returnFocus) back?.focus({ preventScroll: true });
  };
  // The dialog itself, so its name is read first and the arrows scroll it.
  useLayoutEffect(() => {
    if (open) dialog.current?.focus({ preventScroll: true });
  }, [open]);
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== '?' ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        takesTyping(document.activeElement)
      )
        return;
      event.preventDefault();
      show();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (isOpen.current && !dialog.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    // Focus sent outside some other way than a click, which closes it, is brought back.
    const onFocus = (event: FocusEvent) => {
      if (isOpen.current && !dialog.current?.contains(event.target as Node))
        dialog.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, []);
  return { open, show, close, button, dialog };
}

export type Help = ReturnType<typeof useHelp>;

export function HelpToggle({ help: { open, show, close, button } }: { help: Help }) {
  return (
    <button
      ref={button}
      type="button"
      class="control help-toggle"
      title="Mouse and keyboard (?)"
      aria-label="Mouse and keyboard"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="help"
      onClick={() => (open ? close() : show())}
    >
      ?
    </button>
  );
}

export function HelpDialog({ help: { open, close, dialog: ref } }: { help: Help }) {
  /** Tab wraps within the dialog. */
  const keepFocus = (event: KeyboardEvent) => {
    const dialog = ref.current!;
    const stops = [...dialog.querySelectorAll<HTMLElement>('button, a[href]')];
    const active = document.activeElement;
    const leaving = event.shiftKey ? active === stops[0] || active === dialog : active === stops.at(-1);
    if (!leaving) return;
    event.preventDefault();
    (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
  };
  return (
    <section
      ref={ref}
      class="help-dialog"
      id="help"
      hidden={!open}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape' || (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey)) {
          event.preventDefault();
          close();
        } else if (event.key === 'Tab') keepFocus(event);
      }}
    >
      <div class="popup-title">
        <h2 id="help-title">Mouse and keyboard</h2>
        <button type="button" aria-label="Close" onClick={() => close()}>
          ×
        </button>
      </div>
      {controlGroups.map(group => (
        <Group key={group.title} {...group} />
      ))}
    </section>
  );
}
