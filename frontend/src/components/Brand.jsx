export function BrandMark({ inverse = false, small = false }) {
  const logo = `${import.meta.env.BASE_URL}ehe-logo-${inverse ? 'white' : 'wine'}.png`;

  return (
    <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-hidden="true">
      <img src={logo} alt="" />
    </span>
  );
}

export default function Brand({ inverse = false, compact = false }) {
  return (
    <div className={`brand-lockup${inverse ? ' brand-lockup-inverse' : ''}`}>
      <BrandMark inverse={inverse} small={compact} />
      <span>
        <strong>EHE ERP</strong>
        {!compact && <small>Atelier & commandes</small>}
      </span>
    </div>
  );
}
