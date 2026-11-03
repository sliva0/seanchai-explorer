/** The next of ascending `steps` above or below `scale`; none past either end. */
export function zoomStep(steps: number[], scale: number, direction: 1 | -1): number | undefined {
  return direction > 0 ? steps.find(step => step > scale + 0.001) : steps.findLast(step => step < scale - 0.001);
}
