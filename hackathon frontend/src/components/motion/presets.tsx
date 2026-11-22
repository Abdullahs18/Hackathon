import type { ReactNode } from 'react';
import { m, useReducedMotion, type Variants } from 'motion/react';

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 28 } },
};

/** Fade + subtle Y-slide. Re-mount with a changing `key` to replay (routes, steps). */
export function FadeSlide({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <m.div
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}

export const tapSpring = {
  whileHover: { y: -2, scale: 1.01 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 24 },
};
