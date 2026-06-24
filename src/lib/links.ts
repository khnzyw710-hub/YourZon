const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function href(path: string): string {
  return `${basePath}${path}`;
}
