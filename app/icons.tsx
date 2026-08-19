type IconProps = { size?: number };

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
} as const;

export function SubmitIcon({ size = 17 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export function PencilIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M14.5 5l-7 7 7 7" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

export function PlusIcon({ size = 17 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function RefreshIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M20 12a8 8 0 1 1-2.7-6" />
      <path d="M20 4.5V10h-5.5" />
    </svg>
  );
}

export function UndoIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M4 12a8 8 0 1 0 2.7-6" />
      <path d="M4 4.5V10h5.5" />
    </svg>
  );
}

export function TodayIcon({ size = 16 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
