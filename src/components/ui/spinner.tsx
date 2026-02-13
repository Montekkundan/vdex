import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

type SpinnerSize = "sm" | "md" | "lg";

function Spinner({
  className,
  size = "md",
  ...props
}: React.ComponentProps<"svg"> & { size?: SpinnerSize }) {
  const sizeClass = size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-4";
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn(sizeClass, "animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
