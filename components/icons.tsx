import type { Quadrant } from "@/lib/quadrants";

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

export function NoteIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M6 3.5h8l4 4V20.5H6z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 12h6" />
      <path d="M9 15.5h4.5" />
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

export function SpinnerIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} className="spinner" width={size} height={size}>
      <path d="M12 4a8 8 0 1 1-8 8" opacity={0.9} />
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

export function ChevronRightIcon({ size = 14 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M9.5 5l7 7-7 7" />
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

export function OfflineIcon({ size = 17 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M4.5 9.5A12 12 0 0 1 12 7c3 0 5.7 1 7.5 2.5" />
      <path d="M7.5 13a7.5 7.5 0 0 1 7.8-.8" />
      <path d="M10.5 16.5a2.8 2.8 0 0 1 3 0" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function AlertIcon({ size = 17 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" strokeWidth={2.4} />
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

export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

export function FlameIcon({ size = 14 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M12 3.5c1 2.6 4.5 4.6 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.5.6-2.7 1.4-3.8.3 1 .9 1.8 1.8 2.3-.3-2.6.2-5 1.3-7z" />
    </svg>
  );
}

export function CompassIcon({ size = 14 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </svg>
  );
}

export function BoltIcon({ size = 14 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12L13 3z" />
    </svg>
  );
}

export function MoonIcon({ size = 14 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z" />
    </svg>
  );
}

export function MoveIcon({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M9 6l3-3 3 3" />
      <path d="M9 18l3 3 3-3" />
      <path d="M6 9l-3 3 3 3" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  );
}

export function MatrixGlyph({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <rect x="4" y="4" width="6.6" height="6.6" rx="1.6" />
      <rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6" />
      <rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6" />
      <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.6" />
    </svg>
  );
}

export function BookGlyph({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M12 6.5c-1.6-1.4-3.8-2-7-2v13c3.2 0 5.4.6 7 2 1.6-1.4 3.8-2 7-2v-13c-3.2 0-5.4.6-7 2z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

export function ReviewGlyph({ size = 15 }: IconProps) {
  return (
    <svg {...stroke} width={size} height={size}>
      <path d="M4.5 19.5v-5" />
      <path d="M9.5 19.5v-9" />
      <path d="M14.5 19.5v-6.5" />
      <path d="M19.5 19.5V6.5" />
      <path d="M4.5 9.5c4-.5 8-2.5 10.5-5" />
      <path d="M12.5 4l2.8.3-.5 2.8" />
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

const QUADRANT_GLYPHS: Record<Quadrant, (props: IconProps) => React.JSX.Element> = {
  do: FlameIcon,
  plan: CompassIcon,
  quick: BoltIcon,
  later: MoonIcon,
};

export function QuadrantGlyph({ quadrant, size }: { quadrant: Quadrant; size?: number }) {
  const Glyph = QUADRANT_GLYPHS[quadrant];
  return <Glyph size={size} />;
}
