import type { ReactNode } from 'react';

export type ToastOptions = {
  description?: string;
  duration?: number;
};

export const toast = {
  success: (_message: string, _options?: ToastOptions) => undefined,
  error: (_message: string, _options?: ToastOptions) => undefined,
  info: (_message: string, _options?: ToastOptions) => undefined,
  warning: (_message: string, _options?: ToastOptions) => undefined,
  message: (_message: string, _options?: ToastOptions) => undefined,
};

export function Toaster(_props: { children?: ReactNode }) {
  return null;
}
