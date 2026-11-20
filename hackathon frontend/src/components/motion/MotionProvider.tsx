import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

const loadFeatures = () =>
  import('@/lib/motionFeatures').then((mod) => mod.default);

/** Async-loaded motion features + automatic prefers-reduced-motion support. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
