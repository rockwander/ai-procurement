import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

interface UploadResult {
  url: string;
  pathname: string;
}

// Upload file to appropriate storage based on environment
export async function uploadFile(
  file: File | Buffer,
  filename: string,
  folder: 'policy-documents' | 'rfq-pdfs' | 'supplier-uploads' | 'po-pdfs'
): Promise<UploadResult> {
  if (isProduction && process.env.BLOB_READ_WRITE_TOKEN) {
    // Use Vercel Blob in production
    const blob = await put(`${folder}/${filename}`, file, {
      access: 'public',
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
    };
  } else {
    // Use local filesystem in development
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder);

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);

    // Convert File to Buffer if necessary
    let buffer: Buffer;
    if (file instanceof Buffer) {
      buffer = file;
    } else {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // Write file
    fs.writeFileSync(filePath, buffer);

    const url = `/uploads/${folder}/${filename}`;

    return {
      url,
      pathname: `${folder}/${filename}`,
    };
  }
}

// Get file URL (handles both local and production)
export function getFileUrl(pathname: string): string {
  if (isProduction && process.env.BLOB_READ_WRITE_TOKEN) {
    // Vercel Blob URL
    return `https://${process.env.VERCEL_URL}/api/file/${pathname}`;
  } else {
    // Local URL
    return `/uploads/${pathname}`;
  }
}

// Generate unique filename
export function generateFilename(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${base}-${timestamp}-${random}${ext}`;
}
