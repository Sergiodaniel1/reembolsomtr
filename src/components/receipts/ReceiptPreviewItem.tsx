import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, X, FileText, Loader2 } from 'lucide-react';
import { getSignedReceiptUrl, isPdfFile, getDisplayFileName } from '@/lib/storage-utils';

interface ReceiptPreviewItemProps {
  receiptPath: string;
  index: number;
  disabled?: boolean;
  onRemove?: (path: string) => void;
}

export function ReceiptPreviewItem({ 
  receiptPath, 
  index, 
  disabled = false,
  onRemove 
}: ReceiptPreviewItemProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSignedUrl() {
      setLoading(true);
      const url = await getSignedReceiptUrl(receiptPath, 3600); // 1 hour
      setSignedUrl(url);
      setLoading(false);
    }
    fetchSignedUrl();
  }, [receiptPath]);

  const handleView = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    } else {
      // Try to get a fresh URL
      const url = await getSignedReceiptUrl(receiptPath, 3600);
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(receiptPath);
  };

  const isPdf = isPdfFile(receiptPath);
  const fileName = getDisplayFileName(receiptPath);

  return (
    <Card className="relative group overflow-hidden">
      <div className="aspect-square flex items-center justify-center bg-muted p-2">
        {loading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : isPdf ? (
          <div className="flex flex-col items-center gap-1">
            <FileText className="h-10 w-10 text-destructive" />
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {fileName}
            </span>
          </div>
        ) : signedUrl ? (
          <img
            src={signedUrl}
            alt={`Comprovante ${index + 1}`}
            className="w-full h-full object-cover rounded"
            onError={() => setSignedUrl(null)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <FileText className="h-10 w-10" />
            <span className="text-xs">Erro ao carregar</span>
          </div>
        )}
      </div>
      
      {/* Overlay Actions */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8"
          onClick={handleView}
          disabled={loading}
        >
          <Eye className="h-4 w-4" />
        </Button>
        {!disabled && onRemove && (
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}
