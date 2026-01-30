-- Create system_settings table for admin configuration
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings"
ON public.system_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Everyone can view settings (for session timeout, etc)
CREATE POLICY "Everyone can view settings"
ON public.system_settings
FOR SELECT
USING (true);

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
('max_reimbursement_amount', '{"value": 10000}', 'Valor máximo permitido por reembolso'),
('require_receipt', '{"value": true}', 'Exigir comprovante anexado'),
('auto_approve_below', '{"value": 0}', 'Aprovar automaticamente abaixo deste valor (0 = desativado)'),
('session_timeout_minutes', '{"value": 30}', 'Tempo de inatividade para logout automático (minutos)');

-- Trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add RLS policies for storage bucket receipts
CREATE POLICY "Users can upload their own receipts"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own receipts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own receipts"
ON storage.objects
FOR DELETE
USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Managers and finance can view all receipts"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'receipts' AND (
    public.has_role(auth.uid(), 'gerente') OR
    public.has_role(auth.uid(), 'financeiro') OR
    public.has_role(auth.uid(), 'admin')
  )
);

-- Make receipts bucket public for viewing
UPDATE storage.buckets SET public = true WHERE id = 'receipts';