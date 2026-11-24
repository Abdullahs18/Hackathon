import { useEffect } from 'react';
import { m, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

/**
 * Decorative only: never replaces the system cursor or intercepts clicks.
 * Motion values avoid React renders on every pointer event.
 */
export function SecurityCursor() {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(-300);
  const y = useMotionValue(-300);
  const visible = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 170, damping: 25, mass: 0.45 });
  const springY = useSpring(y, { stiffness: 170, damping: 25, mass: 0.45 });

  useEffect(() => {
    if (reduceMotion) return;

    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const hide = () => visible.set(0);
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== 'mouse') {
        hide();
        return;
      }
      x.set(event.clientX);
      y.set(event.clientY);
      visible.set(1);
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) hide();
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leave);
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, { passive: true });
    media.addEventListener('change', hide);

    return () => {
      hide();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', hide);
      window.removeEventListener('scroll', hide);
      media.removeEventListener('change', hide);
    };
  }, [reduceMotion, visible, x, y]);

  if (reduceMotion) return null;

  return (
    <m.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 hidden select-none [@media(hover:hover)_and_(pointer:fine)]:block"
      style={{ x: springX, y: springY, opacity: visible }}
    >
      <div className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_70%)]" />
      <div className="absolute left-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-card/95 text-primary shadow-sm">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
    </m.div>
  );
}
