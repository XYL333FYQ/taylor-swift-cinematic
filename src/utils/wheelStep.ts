/** A mouse-wheel notch selects one item; small touchpad deltas accumulate to one step. */
export function wheelStep(event: WheelEvent, accumulator: { current: number }, delta: number) {
  if (!delta) return 0;
  if (event.deltaMode !== 0 || Math.abs(delta) >= 50) {
    accumulator.current = 0;
    return Math.sign(delta);
  }
  if (accumulator.current && Math.sign(accumulator.current) !== Math.sign(delta)) accumulator.current = 0;
  accumulator.current += delta;
  if (Math.abs(accumulator.current) < 36) return 0;
  accumulator.current -= Math.sign(accumulator.current) * 36;
  return Math.sign(delta);
}
