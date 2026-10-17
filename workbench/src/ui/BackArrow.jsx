import { ArrowLeft } from 'lucide-react';

export default function BackArrow({ onClick, label = 'Geri', title = label }) {
  return <button type="button" className="ui-back-arrow" onClick={onClick} aria-label={label} title={title}>
    <ArrowLeft size={21} strokeWidth={1.7}/>
  </button>;
}
