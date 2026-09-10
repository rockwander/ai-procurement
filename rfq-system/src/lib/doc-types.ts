// Client-safe: the document types the create-RFQ chat accepts. The actual
// parsing lives in doc-extract.ts (server-only).
export const SUPPORTED_TEXT_DOC_EXTENSIONS = ['.txt', '.md', '.csv', '.pdf', '.docx'] as const;
export const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;
export const SUPPORTED_DOC_EXTENSIONS = [
  ...SUPPORTED_TEXT_DOC_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
] as const;

export function docExtOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function isSupportedDoc(name: string): boolean {
  return (SUPPORTED_DOC_EXTENSIONS as readonly string[]).includes(docExtOf(name));
}

export function isImageDoc(name: string): boolean {
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(docExtOf(name));
}

/** MIME type for an image extension, for Gemini inlineData parts. */
export function imageMimeOf(name: string): string {
  switch (docExtOf(name)) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}
