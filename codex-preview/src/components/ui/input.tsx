import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-[4px_12px_12px_4px] border border-[rgba(var(--accent-secondary-rgb),0.2)] bg-black/[0.10] px-4 py-2 text-sm',
          'placeholder:text-[var(--color-text-secondary)] placeholder:opacity-60',
          'text-[var(--color-text-primary)]',
          'transition-[border-color,background-color,box-shadow] duration-200',
          'focus:border-[var(--accent-primary)] focus:bg-[rgba(var(--accent-secondary-rgb),0.055)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--accent-primary-rgb),0.14)] focus:shadow-[inset_3px_0_0_var(--accent-primary)]',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
