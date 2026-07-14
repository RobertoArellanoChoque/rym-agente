export function RymLogo({ className, textColor = "var(--foreground)" }: { className?: string; textColor?: string }) {
  return (
    <svg
      viewBox="0 0 220 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Recuperos y Mandatos"
      style={{ color: "var(--primary)" }}
    >
      {/* "recuperos" text */}
      <text
        x="0"
        y="28"
        fontFamily="Cabinet Grotesk, Inter, system-ui, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill={textColor}
        letterSpacing="-0.3"
      >
        recuperos
      </text>

      {/* Checkmark icon */}
      <g transform="translate(103, 4)">
        {/* V-check stroke */}
        <path
          d="M2 12 L8 20 L20 2"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Underline dash */}
        <line
          x1="6"
          y1="26"
          x2="14"
          y2="26"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>

      {/* "mandatos" text */}
      <text
        x="132"
        y="28"
        fontFamily="Cabinet Grotesk, Inter, system-ui, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill={textColor}
        letterSpacing="-0.3"
      >
        mandatos
      </text>
    </svg>
  )
}
