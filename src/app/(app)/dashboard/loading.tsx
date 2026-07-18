import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-start justify-between p-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-11 w-11 rounded-xl" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
          <CardContent><Skeleton className="h-56 w-full" /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
          <CardContent><Skeleton className="h-56 w-full" /></CardContent>
        </Card>
      </div>
    </div>
  );
}
