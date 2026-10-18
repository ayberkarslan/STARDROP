export function YRT_Showcase({ src, alt, className, ...props }) {
  return <figure {...props} className={['sd-showcase', className].filter(Boolean).join(' ')}>
    <div className="sd-showcase__float"><img src={src} alt={alt} draggable="false"/></div>
    <div className="sd-showcase__shadow" aria-hidden="true"/>
  </figure>;
}
