import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring font-display uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/20 text-primary hover:bg-primary/30",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive/20 text-destructive hover:bg-destructive/30",
        outline: "text-foreground",
        
        pending: "border-transparent bg-status-pending/20 text-status-pending",
        confirmed: "border-transparent bg-status-confirmed/20 text-status-confirmed",
        in_progress: "border-transparent bg-status-progress/20 text-status-progress",
        completed: "border-transparent bg-status-completed/20 text-status-completed",
        cancelled: "border-transparent bg-status-cancelled/20 text-status-cancelled",
        bumped: "border-transparent bg-status-bumped/20 text-status-bumped",
        
        validity1: "border-transparent bg-muted text-muted-foreground",
        validity2: "border-transparent bg-blue-500/20 text-blue-400",
        validity3: "border-transparent bg-primary/20 text-primary shadow-[0_0_10px_rgba(234,88,12,0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
