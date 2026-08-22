export const QUADRANTS = ["do", "plan", "quick", "later"] as const;

export type Quadrant = (typeof QUADRANTS)[number];

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  do: "Do now",
  plan: "Schedule",
  quick: "Quick",
  later: "Later",
};

export const QUADRANT_AXES: Record<Quadrant, string> = {
  do: "Urgent, important",
  plan: "Important, not urgent",
  quick: "Urgent, not important",
  later: "Neither",
};

export const QUADRANT_EMPTY: Record<Quadrant, string> = {
  do: "Nothing is on fire.",
  plan: "Nothing planned yet.",
  quick: "No small stuff waiting.",
  later: "Nothing parked here.",
};

export function isQuadrant(value: unknown): value is Quadrant {
  return typeof value === "string" && (QUADRANTS as readonly string[]).includes(value);
}
