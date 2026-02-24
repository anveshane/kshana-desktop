import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  TextareaHTMLAttributes,
} from 'react';

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

export function Badge(props: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} />;
}

export function Tabs({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div {...props}>{children}</div>;
}

export function TabsList({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div {...props}>{children}</div>;
}

export function TabsTrigger(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}

export function TabsContent({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div {...props}>{children}</div>;
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
