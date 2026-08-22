import type { Transition } from "motion/react";

// Apple-feel spring presets: nothing in the app moves on a linear timer.
export const snappy: Transition = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 };
export const gentle: Transition = { type: "spring", stiffness: 300, damping: 32 };
export const bouncy: Transition = { type: "spring", stiffness: 600, damping: 26, mass: 0.7 };
