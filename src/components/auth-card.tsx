import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-6 py-7 shadow-sm">
      <CardHeader className="px-6 sm:px-8">
        <CardTitle>
          <h1 className="font-display text-primary-strong text-2xl font-semibold">{title}</h1>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-6 sm:px-8">{children}</CardContent>
    </Card>
  );
}
