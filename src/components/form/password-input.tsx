"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide (eye) toggle so people can check what they
 * typed before submitting. Drop-in replacement for <Input type="password">:
 * works with React Hook Form's `register()` and with <FormField> (which
 * injects id / aria-* props onto the input).
 */
export function PasswordInput({ className, disabled, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const t = useTranslations("common");
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        // Keep browsers from auto-capitalising or "correcting" a revealed password.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? t("hidePassword") : t("showPassword")}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
