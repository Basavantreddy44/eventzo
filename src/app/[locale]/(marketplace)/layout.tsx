import { Suspense } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ShortlistBar } from "@/features/shortlist/components/shortlist-bar";

export default async function MarketplaceLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {/* Shortlist + compare (Roadmap C4). Reads the pathname, so it renders after the static shell. */}
      <Suspense fallback={null}>
        <ShortlistBar />
      </Suspense>
    </div>
  );
}
