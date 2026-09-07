'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  disabled,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2',
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
        variant === 'secondary' &&
          'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        variant === 'ghost' && 'text-gray-600 hover:bg-gray-100',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm',
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm',
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 text-sm',
        props.className
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-white rounded-lg shadow border border-gray-100', className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  color = 'gray',
}: {
  children: ReactNode;
  color?: 'gray' | 'green' | 'blue' | 'yellow' | 'red' | 'purple';
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        color === 'gray' && 'bg-gray-100 text-gray-700',
        color === 'green' && 'bg-green-100 text-green-700',
        color === 'blue' && 'bg-blue-100 text-blue-700',
        color === 'yellow' && 'bg-yellow-100 text-yellow-800',
        color === 'red' && 'bg-red-100 text-red-700',
        color === 'purple' && 'bg-purple-100 text-purple-700'
      )}
    >
      {children}
    </span>
  );
}

const STATUS_COLORS: Record<string, 'gray' | 'green' | 'blue' | 'yellow' | 'red' | 'purple'> = {
  draft: 'gray',
  sent: 'blue',
  viewed: 'yellow',
  submitted: 'green',
  evaluating: 'purple',
  awarded: 'green',
  cancelled: 'red',
  declined: 'red',
  accepted: 'green',
  rejected: 'red',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={STATUS_COLORS[status] ?? 'gray'}>{status}</Badge>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-500 text-sm">
      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
      {children}
    </div>
  );
}
