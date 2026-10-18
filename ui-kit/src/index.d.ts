import type { ReactNode, ComponentPropsWithoutRef, ElementType, Ref } from 'react';

export type YRT_ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'bare' | 'danger';
export type YRT_ButtonSize = 'sm' | 'md';
export type YRT_StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface YRT_ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: YRT_ButtonVariant;
  size?: YRT_ButtonSize;
  loading?: boolean;
}
export function YRT_Button(props: YRT_ButtonProps & { ref?: Ref<HTMLButtonElement> }): ReactNode;
export function YRT_IconButton(props: YRT_ButtonProps & { label: string; ref?: Ref<HTMLButtonElement> }): ReactNode;
export function YRT_ChoiceCard(props: ComponentPropsWithoutRef<'button'> & { ref?: Ref<HTMLButtonElement> }): ReactNode;
export function YRT_BackArrow(props: { onClick?: () => void; label?: string; title?: string; className?: string }): ReactNode;

export interface YRT_PanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: ElementType;
}
export function YRT_Panel(props: YRT_PanelProps): ReactNode;
export function YRT_StatusBadge(props: ComponentPropsWithoutRef<'span'> & { tone?: YRT_StatusTone }): ReactNode;
export function YRT_Disclosure(props: Omit<ComponentPropsWithoutRef<'details'>, 'title'> & { title: ReactNode }): ReactNode;
export function YRT_Showcase(props: ComponentPropsWithoutRef<'figure'> & { src: string; alt: string }): ReactNode;
export function YRT_TextField(props: ComponentPropsWithoutRef<'input'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}): ReactNode;

export interface YRT_SelectOption { value: string; label: ReactNode; searchText?: string }
export interface YRT_SelectMenuProps {
  value: string;
  options: YRT_SelectOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}
export function YRT_SelectMenu(props: YRT_SelectMenuProps): ReactNode;

export { YRT_Button as Button, YRT_IconButton as IconButton, YRT_ChoiceCard as ChoiceCard,
  YRT_BackArrow as BackArrow, YRT_Panel as Panel, YRT_StatusBadge as StatusBadge,
  YRT_TextField as TextField, YRT_SelectMenu as SelectMenu,
  YRT_Disclosure as Disclosure, YRT_Showcase as Showcase };
export type { YRT_ButtonVariant as ButtonVariant, YRT_ButtonSize as ButtonSize,
  YRT_StatusTone as StatusTone, YRT_ButtonProps as ButtonProps,
  YRT_PanelProps as PanelProps, YRT_SelectOption as SelectOption,
  YRT_SelectMenuProps as SelectMenuProps };
