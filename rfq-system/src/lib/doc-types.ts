// Client-safe: the document types the create-RFQ chat accepts. The actual
// parsing lives in doc-extract.ts (server-only).
export const SUPPORTED_DOC_EXTENSIONS = ['.txt', '.md', '.csv', '.pdf', '.docx'] as const;

export function docExtOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function isSupportedDoc(name: string): boolean {
  return (SUPPORTED_DOC_EXTENSIONS as readonly string[]).includes(docExtOf(name));
}
