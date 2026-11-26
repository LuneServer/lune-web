interface Props {
  alt?: string;
  className?: string;
}

export function LuneMark({ alt = 'Lune', className = 'w-7 h-7' }: Props) {
  return (
    <>
      <img src="/lune-mark.svg" alt={alt} className={`lune-mark-dark ${className}`} />
      <img src="/lune-mark-light.svg" alt={alt} className={`lune-mark-light ${className}`} />
    </>
  );
}
