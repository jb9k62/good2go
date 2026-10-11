export function titleCase(text: string): string {
  return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}
