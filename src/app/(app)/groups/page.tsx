export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { GroupsList } from "./groups-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GroupFormDialog } from "./group-form";

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Группы</h1>
          <p className="text-sm text-muted-foreground">{groups.length} групп</p>
        </div>
        <GroupFormDialog
          trigger={<Button><Plus className="mr-2 h-4 w-4" /> Добавить</Button>}
        />
      </div>
      <GroupsList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          icon: g.icon,
          count: g._count.subscriptions,
        }))}
      />
    </div>
  );
}