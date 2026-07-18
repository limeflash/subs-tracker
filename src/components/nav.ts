import {
  LayoutDashboard,
  CreditCard,
  FolderTree,
  Users,
  Wallet,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/subscriptions", label: "Подписки", icon: CreditCard },
  { href: "/groups", label: "Группы", icon: FolderTree },
  { href: "/employees", label: "Сотрудники", icon: Users },
  { href: "/salaries", label: "Выплаты", icon: Wallet },
  { href: "/statistics", label: "Статистика", icon: BarChart3 },
  { href: "/settings", label: "Настройки", icon: Settings },
];
