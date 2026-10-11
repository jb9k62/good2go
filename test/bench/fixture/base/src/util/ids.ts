let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${String(counter).padStart(4, '0')}`;
}

export function resetIds(): void {
  counter = 0;
}
