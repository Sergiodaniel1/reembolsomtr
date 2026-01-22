import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, FileX } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = FileX,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('empty-state', className)}>
      <Icon className="empty-state-icon" />
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-sm max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
