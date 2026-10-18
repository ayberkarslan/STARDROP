import type { ReactNode, ComponentPropsWithoutRef, ElementType, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}
export function Button(props: ButtonProps & { ref?: Ref<HTMLButtonElement> }): ReactNode;
export function IconButton(props: ButtonProps & { label: string; ref?: Ref<HTMLButtonElement> }): ReactNode;
export function ChoiceCard(props: ComponentPropsWithoutRef<'button'> & { ref?: Ref<HTMLButtonElement> }): ReactNode;
export function BackArrow(props: { onClick?: () => void; label?: string; title?: string; className?: string }): ReactNode;

export interface PanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: ElementType;
}
export function Panel(props: PanelProps): ReactNode;
export function StatusBadge(props: ComponentPropsWithoutRef<'span'> & { tone?: StatusTone }): ReactNode;
export function TextField(props: ComponentPropsWithoutRef<'input'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}): ReactNode;

export interface SelectOption { value: string; label: ReactNode; searchText?: string }
export interface SelectMenuProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}
export function SelectMenu(props: SelectMenuProps): ReactNode;
