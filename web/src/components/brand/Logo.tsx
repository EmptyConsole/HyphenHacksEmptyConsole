type LogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

/** Hestia mark: inset outline star with yellow / red / blue tip dots. */
export default function Logo({ size = 22, className, title }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="10" fill="#1B2450" />
      <path
        d="M16 7 L18.17 13.01 L24.56 13.22 L19.52 17.14 L21.29 23.28 L16 19.7 L10.71 23.28 L12.48 17.14 L7.44 13.22 L13.83 13.01 Z"
        fill="none"
        stroke="#FFF4D6"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M16 9.2 L11.6 21.6 L20.4 21.6 Z"
        fill="none"
        stroke="#FFF4D6"
        strokeOpacity="0.28"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="7.2" r="3.1" fill="#FFB547" />
      <circle cx="10.9" cy="22.9" r="3.1" fill="#FF4D5E" />
      <circle cx="21.1" cy="22.9" r="3.1" fill="#6B7CFF" />
    </svg>
  );
}
