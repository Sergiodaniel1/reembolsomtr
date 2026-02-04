import React, { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractReceiptPath } from '@/lib/storage-utils';
import { ReceiptPreviewItem } from './ReceiptPreviewItem';

interface ReceiptUploadProps {
  receiptUrls: string[];
  onReceiptsChange: (urls: string[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function ReceiptUpload({ 
  receiptUrls, 
  onReceiptsChange, 
  disabled = false,
  maxFiles = 5 
}: ReceiptUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    const validFiles = Array.from(files).filter(file => {
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Tipo inválido',
          description: `${file.name} não é um arquivo válido. Use PDF, JPG ou PNG.`,
          variant: 'destructive',
        });
        return false;
      }
      if (file.size > maxSize) {
        toast({
          title: 'Arquivo muito grande',
          description: `${file.name} excede o limite de 5MB.`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    });

    if (receiptUrls.length + validFiles.length > maxFiles) {
      toast({
        title: 'Limite excedido',
        description: `Máximo de ${maxFiles} comprovantes permitidos.`,
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    const newUrls: string[] = [];

    try {
      for (const file of validFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Store the relative path instead of public URL (bucket is now private)
        // We'll use this path to generate signed URLs when displaying
        newUrls.push(fileName);
      }

      onReceiptsChange([...receiptUrls, ...newUrls]);
      toast({
        title: 'Upload concluído',
        description: `${validFiles.length} comprovante(s) enviado(s).`,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }, [user, receiptUrls, onReceiptsChange, maxFiles, toast]);

  const handleRemove = async (pathToRemove: string) => {
    // Extract file path if it's a URL (legacy data) or use as-is
    const path = extractReceiptPath(pathToRemove) || pathToRemove;
    if (path) {
      try {
        await supabase.storage.from('receipts').remove([path]);
      } catch (error) {
        console.error('Error removing file:', error);
      }
    }
    onReceiptsChange(receiptUrls.filter(url => url !== pathToRemove));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [disabled, handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && !uploading && document.getElementById('receipt-input')?.click()}
      >
        <input
          id="receipt-input"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
          disabled={disabled || uploading}
        />
        
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Enviando...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Arraste arquivos ou clique para enviar
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, JPG ou PNG (máx. 5MB cada, até {maxFiles} arquivos)
            </p>
          </div>
        )}
      </div>

      {/* Preview Grid */}
      {receiptUrls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {receiptUrls.map((receiptPath, index) => (
            <ReceiptPreviewItem
              key={index}
              receiptPath={receiptPath}
              index={index}
              disabled={disabled}
              onRemove={disabled ? undefined : handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
