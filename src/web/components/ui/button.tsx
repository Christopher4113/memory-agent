import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-button)] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-surface text-text border border-border hover:bg-[#f4f4f3]",
        secondary: "bg-[#fcfcfc] text-text border border-border hover:bg-[#f4f4f3]",
        primary: "bg-text text-white border border-text hover:bg-[#2a2a29]",
        ghost: "text-muted hover:bg-[#f0f0ee]",
      },
      size: { default: "h-9 px-3.5", sm: "h-7 px-2.5 text-xs", icon: "size-8" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
))
Button.displayName = "Button"
