import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const statusClass =
    status === "active"
      ? "border-green-300 bg-green-100 text-green-900"
      : status === "creating"
        ? "border-amber-300 bg-amber-100 text-amber-900"
        : status === "error"
          ? "border-red-300 bg-red-100 text-red-900"
          : "border-gray-300 bg-gray-100 text-gray-900";
  return (
    <Badge variant="outline" className={statusClass}>
      {status}
    </Badge>
  );
}
