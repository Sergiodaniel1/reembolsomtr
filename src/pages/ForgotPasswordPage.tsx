import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Mail, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/redefinir-senha`,
      });

      if (error) {
        toast({
          title: 'Erro',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
        <div className="w-full max-w-md text-center animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">E-mail Enviado!</h1>
          <p className="text-muted-foreground mt-2 mb-6">
            Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
          <Link to="/auth">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4">
            <Receipt className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Esqueci Minha Senha</h1>
          <p className="text-muted-foreground mt-1">
            Informe seu e-mail para receber o link de redefinição
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-center">Redefinir Senha</CardTitle>
            <CardDescription className="text-center">
              Enviaremos um link para o seu e-mail cadastrado
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar Link de Redefinição'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link to="/auth" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" />
                Voltar ao Login
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Sistema de Reembolso Corporativo © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
