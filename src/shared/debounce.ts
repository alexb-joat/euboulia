export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...a: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = undefined; fn(...a); }, ms);
  }) as T & { cancel(): void };
  wrapped.cancel = () => { if (t) clearTimeout(t); t = undefined; };
  return wrapped;
}
