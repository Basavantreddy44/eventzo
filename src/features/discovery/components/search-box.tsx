import Form from "next/form";
import { getLocale } from "next-intl/server";
import { Search } from "lucide-react";
import { getPathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Keyword search. A GET form (`next/form`): works without JavaScript and does
 * a client-side navigation when it's available.
 */
export async function SearchBox({
  defaultValue,
  placeholder,
  submitLabel,
  hidden,
  className,
  size = "default",
}: {
  defaultValue?: string;
  placeholder: string;
  submitLabel: string;
  hidden?: Record<string, string | undefined>;
  className?: string;
  size?: "default" | "lg";
}) {
  const action = getPathname({ href: "/search", locale: await getLocale() });
  return (
    <Form action={action} role="search" className={cn("flex w-full gap-2", className)}>
      {Object.entries(hidden ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <div className="relative flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={100}
          className={cn("pl-9", size === "lg" && "h-12 text-base")}
        />
      </div>
      <Button type="submit" size={size === "lg" ? "lg" : "default"} className={size === "lg" ? "h-12" : undefined}>
        {submitLabel}
      </Button>
    </Form>
  );
}
