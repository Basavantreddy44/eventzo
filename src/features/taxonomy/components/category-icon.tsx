import {
  Cake,
  Camera,
  Car,
  ClipboardList,
  Flame,
  Flower2,
  Gift,
  Hand,
  Landmark,
  Mail,
  Music,
  Shirt,
  Sparkles,
  Tent,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/** Icon names stored in business_categories.icon → Lucide components. */
const ICONS: Record<string, LucideIcon> = {
  landmark: Landmark,
  utensils: Utensils,
  "flower-2": Flower2,
  camera: Camera,
  sparkles: Sparkles,
  hand: Hand,
  music: Music,
  flame: Flame,
  mail: Mail,
  "clipboard-list": ClipboardList,
  tent: Tent,
  cake: Cake,
  car: Car,
  gift: Gift,
  shirt: Shirt,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Sparkles;
  return <Icon className={className} aria-hidden />;
}
