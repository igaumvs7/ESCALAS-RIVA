import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[4px_12px_12px_4px] text-sm font-semibold transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Botão principal do Command Deck: cor do tema, recorte assimétrico
        // e filete lateral de destaque. Mantém contraste via token do tema.
        default:
          'border border-[rgba(var(--accent-secondary-rgb),0.55)] bg-[var(--accent-secondary)] text-[var(--accent-secondary-contrast)] shadow-[inset_3px_0_0_var(--accent-primary),0_10px_24px_rgba(var(--accent-secondary-rgb),0.18)] hover:-translate-y-0.5 hover:border-[rgba(var(--accent-primary-rgb),0.7)] hover:brightness-110',
        secondary:
          'bg-white/[0.035] text-[var(--color-text-primary)] border border-[rgba(var(--accent-secondary-rgb),0.22)] hover:bg-[rgba(var(--accent-secondary-rgb),0.09)] hover:border-[rgba(var(--accent-secondary-rgb),0.46)]',
        ghost:
          'text-[var(--color-text-secondary)] hover:bg-[rgba(var(--accent-secondary-rgb),0.08)] hover:text-[var(--color-text-primary)]',
        outline:
          'border border-[rgba(var(--accent-secondary-rgb),0.28)] bg-transparent text-[var(--color-text-primary)] hover:bg-[rgba(var(--accent-secondary-rgb),0.07)] hover:border-[rgba(var(--accent-secondary-rgb),0.55)]',
        destructive:
          'bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/90',
        link:
          'text-[var(--accent-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
