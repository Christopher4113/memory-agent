import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center rounded-[var(--radius-base)] border px-1.5 py-px text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      company: "border-text text-text bg-surface",
      project: "border-secondary bg-secondary text-text",
      agent: "border-accent text-accent bg-surface",
      personal: "border-primary text-primary bg-surface",
      unknown: "border-border text-subtle bg-surface",
      outline: "border-border text-muted bg-surface",
      count: "border-hairline bg-[#f4f4f3] text-muted tabular-nums",
    },
  },
  defaultVariants: { variant: "outline" },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, ...props }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...props} />
