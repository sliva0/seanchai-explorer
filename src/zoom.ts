/** What the buttons, keys and wheel step through; the select lists only some of them. */
export const zoomSteps = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** The next of ascending `steps` above or below `scale`; none past either end. */
export function zoomStep(steps: number[], scale: number, direction: 1 | -1): number | undefined {
  return direction > 0 ? steps.find(step => step > scale + 0.001) : steps.findLast(step => step < scale - 0.001);
}

const listed = (select: HTMLSelectElement, value: string) => [...select.options].some(option => option.value === value);

/** Selects `value`, a preset or scale, through a hidden option if the list has none; anything else is ignored. */
export function showZoom(select: HTMLSelectElement, value: string) {
  if (!listed(select, value) && !(Number(value) > 0)) return;
  select.querySelector('option[data-unlisted]')?.remove();
  if (!listed(select, value)) {
    const option = select.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = `${Math.round(Number(value) * 100)}%`;
    option.hidden = true;
    option.dataset.unlisted = '';
    select.append(option);
  }
  select.value = value;
}

/** Shows a stored zoom if it is still an option or step, as one stored from a longer list may be. */
export function restoreZoom(select: HTMLSelectElement, stored: string | null) {
  if (stored !== null && (listed(select, stored) || zoomSteps.includes(Number(stored)))) showZoom(select, stored);
}
