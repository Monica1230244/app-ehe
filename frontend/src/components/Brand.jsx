export function BrandMark({ small = false }) {
  return (
    <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path d="M13 11.5h22v7H21v4h12v7H21v4h14v7H13z" />
        <path className="brand-mark-accent" d="M30.5 7 41 12.8v12.4L30.5 31V7Z" />
      </svg>
    </span>
  );
}

export default function Brand({ inverse = false, compact = false }) {
  return (
    <div className={`brand-lockup${inverse ? ' brand-lockup-inverse' : ''}`}>
      <BrandMark small={compact} />
      <span>
        <strong>EHE ERP</strong>
        {!compact && <small>Atelier & commandes</small>}
      </span>
    </div>
  );
}
