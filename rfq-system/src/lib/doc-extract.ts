// Server-side text extraction for documents attached to the create-RFQ chat.
// We keep only the extracted text in the thread — the binary is never stored.
import { SUPPORTED_DOC_EXTENSIONS, docExtOf, isSupportedDoc } from '@/lib/doc-types';

export { SUPPORTED_DOC_EXTENSIONS, isSupportedDoc };

const MAX_CHARS = 60_000; // guard the prompt size per document

export interface ExtractedDoc {
  name: string;
  text: string;
  truncated: boolean;
}

export async function extractText(name: string, buffer: Buffer): Promise<ExtractedDoc> {
  const ext = docExtOf(name);
  let text = '';

  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    text = buffer.toString('utf-8');
  } else if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const res = await parser.getText();
      text = res.text ?? '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const res = await mammoth.extractRawText({ buffer });
    text = res.value ?? '';
  } else {
    throw new Error(`Unsupported file type: ${ext || name}`);
  }

  text = text.replace(/\r\n/g, '\n').trim();
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);

  return { name, text, truncated };
}
