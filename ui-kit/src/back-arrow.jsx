export function YRT_BackArrow({ onClick, label = 'Geri', title = label, className = '' }) {
  return <button type="button" className={`sd-back-arrow ${className}`} onClick={onClick} aria-label={label} title={title}>
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 19-7-7 7-7"/><path d="M5 12h14"/>
    </svg>
  </button>;
}
