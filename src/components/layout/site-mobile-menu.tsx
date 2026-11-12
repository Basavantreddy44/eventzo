"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Marketplace navigation on small screens. */
export function SiteMobileMenu({
  links,
  title,
  openLabel,
  closeLabel,
}: {
  links: { href: string; label: string }[];
  title: string;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={openLabel}>
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={closeLabel} className="p-4">
        <SheetTitle className="px-1 pt-1">{title}</SheetTitle>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        <nav aria-label={title} className="grid gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="hover:bg-sidebar-accent rounded-md px-3 py-2 text-sm font-medium"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
