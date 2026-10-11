export interface Channel {
  name: string;
  send(to: string, text: string): void;
}

export function memoryChannel(sent: Array<{ to: string; text: string }>): Channel {
  return { name: 'memory', send: (to, text) => void sent.push({ to, text }) };
}
