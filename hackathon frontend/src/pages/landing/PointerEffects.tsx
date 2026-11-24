import type { PointerEvent, ReactNode } from 'react';
import {
  m,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

function usePointerPosition() {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const active = useMotionValue(0);
  const smoothX = useSpring(x, { stiffness: 180, damping: 26 });
  const smoothY = useSpring(y, { stiffness: 180, damping: 26 });

  const reset = () => {
    x.set(0);
    y.set(0);
    active.set(0);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (
      reduced ||
      event.pointerType !== 'mouse' ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ) {
      reset();
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5)));
    y.set(Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5)));
    active.set(1);
  };

  return {
    reduced,
    x: smoothX,
    y: smoothY,
    active,
    events: {
      onPointerMove,
      onPointerLeave: reset,
      onPointerCancel: reset,
      onBlur: reset,
    },
  };
}

export function HeroParallax({ children }: { children: ReactNode }) {
  const pointer = usePointerPosition();
  const rotateX = useTransform(pointer.y, [-0.5, 0.5], [4, -4]);
  const rotateY = useTransform(pointer.x, [-0.5, 0.5], [-5, 5]);

  return (
    <div {...pointer.events} className="relative [perspective:1000px]">
      <m.div
        style={pointer.reduced ? undefined : { rotateX, rotateY }}
        className="relative [transform-style:preserve-3d]"
      >
        {children}
      </m.div>
    </div>
  );
}

export function SpotlightCard({ children }: { children: ReactNode }) {
  const pointer = usePointerPosition();
  const left = useTransform(pointer.x, [-0.5, 0.5], ['0%', '100%']);
  const top = useTransform(pointer.y, [-0.5, 0.5], ['0%', '100%']);
  const background = useMotionTemplate`radial-gradient(240px circle at ${left} ${top}, color-mix(in srgb, var(--primary) 12%, transparent), transparent 75%)`;

  return (
    <div
      {...pointer.events}
      className="relative h-full overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lg sm:p-6"
    >
      {!pointer.reduced && (
        <m.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background, opacity: pointer.active }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function LandingAction({
  children,
  large = false,
  className = '',
  to = '/login',
}: {
  children: ReactNode;
  large?: boolean;
  className?: string;
  to?: string;
}) {
  const pointer = usePointerPosition();
  const x = useTransform(pointer.x, [-0.5, 0.5], [-3, 3]);
  const y = useTransform(pointer.y, [-0.5, 0.5], [-2, 2]);

  return (
    <Button
      asChild
      size={large ? 'lg' : 'default'}
      className={`hover:translate-y-0 active:scale-100 ${className}`}
    >
      <Link to={to} {...pointer.events}>
        {children}
        <m.span
          aria-hidden="true"
          className="inline-flex shrink-0"
          style={pointer.reduced ? undefined : { x, y }}
        >
          <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
        </m.span>
      </Link>
    </Button>
  );
}
