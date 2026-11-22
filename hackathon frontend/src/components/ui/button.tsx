import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "relative isolate inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-lg border border-transparent text-sm font-semibold whitespace-nowrap shadow-xs transition-[transform,box-shadow,background-color,border-color,color] duration-200 outline-none after:pointer-events-none after:absolute after:inset-x-2 after:top-px after:h-px after:rounded-full after:bg-white/25 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-105 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:text-destructive-foreground dark:focus-visible:ring-destructive/40",
        outline:
          "border-border bg-card text-foreground after:bg-white/40 hover:border-primary/50 hover:bg-accent hover:text-accent-foreground dark:bg-card dark:after:bg-white/10",
        secondary:
          "bg-secondary text-secondary-foreground after:bg-white/30 hover:bg-accent",
        ghost:
          "shadow-none after:hidden hover:bg-accent hover:text-accent-foreground hover:shadow-none dark:hover:bg-accent/70",
        link: "h-auto border-0 p-0 text-primary shadow-none after:hidden hover:translate-y-0 hover:shadow-none hover:underline underline-offset-4 active:scale-100",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-10 rounded-full",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
