import {
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  ChartColumn,
  Contact,
  Landmark,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  Grid2x2,
  Inbox,
  LayoutDashboard,
  Package,
  PartyPopper,
  ScrollText,
  Settings,
  Sparkles,
  Undo2,
  Store,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons are referenced by name so nav config can be passed from Server to
 * Client Components (functions can't cross that boundary).
 */
export const navIcons = {
  dashboard: LayoutDashboard,
  profile: UserRound,
  events: PartyPopper,
  bookings: ClipboardList,
  calendar: CalendarDays,
  enquiries: Inbox,
  quotations: FileText,
  services: Store,
  resources: Package,
  team: Users,
  branches: Building2,
  finance: Wallet,
  settings: Settings,
  verification: BadgeCheck,
  audit: ScrollText,
  taxonomy: Grid2x2,
  muhurtham: Sparkles,
  refunds: Undo2,
  notifications: Bell,
  jobs: BriefcaseBusiness,
  schedule: CalendarClock,
  staff: Contact,
  reports: ChartColumn,
  ledger: Landmark,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof navIcons;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /** When set, the item renders disabled with this reason (no dead links). */
  disabledReason?: string;
  /** Match only the exact path (for section roots like /vendor). */
  exact?: boolean;
};
