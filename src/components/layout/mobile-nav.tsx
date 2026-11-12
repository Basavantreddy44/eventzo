"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import type { NavItem } from "./nav-icons";

export function MobileNav({
  items,
  title,
  openLabel,
  closeLabel,
  soonLabel,
  top,
}: {
  items: NavItem[];
  title: string;
  openLabel: string;
  closeLabel: string;
  soonLabel: string;
  top?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={openLabel}>
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={closeLabel} className="p-4">
        <SheetTitle className="px-1 pt-1">{title}</SheetTitle>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        {top ? <div className="grid gap-2">{top}</div> : null}
        <SidebarNav items={items} label={title} soonLabel={soonLabel} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
