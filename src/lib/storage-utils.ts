import { supabase } from '@/integrations/supabase/client';

/**
 * Generate a signed URL for a receipt file
 * The receipts bucket is now private, so we need signed URLs for secure access
 * 
 * @param filePath - The file path (relative path stored in database)
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns The signed URL or null if generation fails
 */
export async function getSignedReceiptUrl(
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    // If it's already a full URL (legacy data), extract the path
    const path = extractReceiptPath(filePath);
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.error('Error generating signed URL:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
}

/**
 * Generate signed URLs for multiple receipt files
 * 
 * @param filePaths - Array of file paths
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Array of objects with original path and signed URL
 */
export async function getSignedReceiptUrls(
  filePaths: string[],
  expiresIn: number = 3600
): Promise<{ path: string; signedUrl: string | null }[]> {
  const results = await Promise.all(
    filePaths.map(async (path) => ({
      path,
      signedUrl: await getSignedReceiptUrl(path, expiresIn),
    }))
  );
  return results;
}

/**
 * Extract the file path from a URL or return the path as-is
 * Handles both legacy public URLs and new relative paths
 */
export function extractReceiptPath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;

  // If it's a relative path (not a URL), return as-is
  if (!urlOrPath.startsWith('http')) {
    return urlOrPath;
  }

  // Extract path from public URL format
  // Format: https://<project>.supabase.co/storage/v1/object/public/receipts/<path>
  const match = urlOrPath.match(/\/receipts\/(.+)$/);
  if (match) {
    return match[1];
  }

  // Extract path from signed URL format
  // Format: https://<project>.supabase.co/storage/v1/object/sign/receipts/<path>?...
  const signedMatch = urlOrPath.match(/\/sign\/receipts\/([^?]+)/);
  if (signedMatch) {
    return signedMatch[1];
  }

  return null;
}

/**
 * Check if a URL/path is a PDF file
 */
export function isPdfFile(urlOrPath: string): boolean {
  const path = extractReceiptPath(urlOrPath) || urlOrPath;
  return path.toLowerCase().endsWith('.pdf');
}

/**
 * Get a display-friendly filename from a path
 */
export function getDisplayFileName(urlOrPath: string, maxLength: number = 20): string {
  const path = extractReceiptPath(urlOrPath) || urlOrPath;
  const parts = path.split('/');
  const fileName = parts[parts.length - 1];
  
  if (fileName.length <= maxLength) {
    return fileName;
  }
  
  return fileName.substring(0, maxLength) + '...';
}
