import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { codecs, ruleKinds } from './constraints.ts';
import { controlGroups } from './text/controls.ts';
import type { ControlGroup } from './text/controls.ts';
import { takesTyping } from './keys.ts';
import { helpText } from './text/help.ts';
import { popupShared } from './text/popup.ts';

function Group({ title, note, controls, marks }: ControlGroup) {
  return (
    <section class={marks ? 'help-group help-marks' : 'help-group'}>
      <h3>{title}</h3>
      {note && <p class="help-note">{note}</p>}
      <dl class="help-list">
        {controls.map(({ keys, does, mark }) => (
          <Fragment key={does}>
            <dt>
              {/* "or" between the ways is for a screen reader; on screen the keys stand apart. */}
              {keys.map((key, index) => (
                <Fragment key={key}>
                  {index > 0 && <span class="sr-only">{helpText.or}</span>}
                  {/* A mark as a line shows it after its end, not a key to press. */}
                  {marks ? <span class={`help-mark help-mark-${mark}`}>{key}</span> : <kbd>{key}</kbd>}
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
 * What interpreted constraints are, said once for every popup naming one: what they are and how far to trust them,
 * how the text and the toolbar show them and what the Wireshark plugin checks, then each kind of rule as the text
 * prints it, how a rule's conditions are written, and each codec's layout.
 */
function ConstraintsHelp() {
  return (
    <section class="help-section help-constraints">
      <h3>{helpText.constraints}</h3>
      <p class="help-note">{helpText.constraintsIntro}</p>
      <p class="help-note">{helpText.constraintsShown}</p>
      <p class="help-note">{helpText.ruleKinds}</p>
      <dl class="help-list help-rule-kinds">
        {Object.entries(ruleKinds).map(([kind, { printed, says }]) => (
          <Fragment key={kind}>
            <dt>
              <code>{printed}</code>
            </dt>
            <dd>{says}</dd>
          </Fragment>
        ))}
      </dl>
      <p class="help-note">{helpText.conditions}</p>
      <p class="help-note">{helpText.codecs}</p>
      <dl class="help-list help-codecs">
        {Object.entries(codecs).map(([codec, { layout }]) => (
          <Fragment key={codec}>
            <dt>
              <code>{codec}</code>
            </dt>
            <dd>{layout}</dd>
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
      title={helpText.toggleTitle}
      aria-label={helpText.title}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="help"
      onClick={() => (open ? close() : show())}
    >
      ?
    </button>
  );
}

/**
 * The dialog itself. `selfHosted` lists the PDF viewer's keys, which only a self-hosted build's pane has: a public build
 * says nothing of them, nor of the build that has them.
 */
export function HelpDialog({ help: { open, close, dialog: ref }, selfHosted }: { help: Help; selfHosted: boolean }) {
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
        <h2 id="help-title">{helpText.title}</h2>
        <button type="button" aria-label={popupShared.close} onClick={() => close()}>
          ×
        </button>
      </div>
      {controlGroups
        .filter(group => selfHosted || !group.selfHosted)
        .map(group => (
          <Group key={group.title} {...group} />
        ))}
      <ConstraintsHelp />
    </section>
  );
}
