import * as Clipboard from 'expo-clipboard';

export async function getClipboardText(): Promise<string | null> {
  try {
    const hasString = await Clipboard.hasStringAsync();
    if (!hasString) return null;
    return Clipboard.getStringAsync();
  } catch {
    return null;
  }
}

export async function setClipboardText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

export function buildClipboardContext(clipText: string, userQuery: string): string {
  return `Clipboard content:\n"${clipText}"\n\nUser question: ${userQuery}`;
}

// Detect if a query is asking about clipboard content
export function isClipboardQuery(query: string): boolean {
  return /clipboard|העתקתי|העתק|הדבר|paste|copy|copied/i.test(query);
}
