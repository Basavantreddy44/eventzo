import { getTranslations } from "next-intl/server";
import { HandCoins, Store, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import type { EventRole } from "@/types/database";
import { getBusinessCategories, getActiveCities, localizedName } from "@/features/taxonomy/queries";
import { deleteBudgetLine, fillBudgetFromEstimate, removeEventMember, revokeEventInvitation } from "../actions";
import { eventBudget } from "../lib/budget";
import { guestSummary } from "../lib/guests";
import { getEventVendors, listBudgetLines, listEventInvitations, listGuests, listMembers } from "../queries";
import { AddBudgetLineForm, PlannedAmountForm } from "./budget-forms";
import { EventDetailsForm } from "./event-forms";
import { AddGuestForm, BulkGuestsForm, GuestActions, HostRsvpForm } from "./guest-forms";
import { InviteMemberForm } from "./people-forms";

export type WorkspaceEvent = {
  id: string;
  title: string;
  event_type: string;
  city_id: string | null;
  start_date: string;
  end_date: string;
  guest_estimate: number | null;
  status: string;
  hosts_text: string | null;
  venue_text: string | null;
  invitation_message: string | null;
  currency: string;
};

type TabProps = { event: WorkspaceEvent; role: EventRole; locale: string; userId: string };

const day = (d: string, locale: string) => formatDateTime(`${d}T00:00:00Z`, locale, "UTC", { dateStyle: "medium" });
const paiseToRupees = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

// ---------- overview ------------------------------------------------------------------------
export async function OverviewTab({ event, role, locale }: TabProps) {
  const editor = role !== "viewer";
  const [t, vendors, guests, lines, cities] = await Promise.all([
    getTranslations("events"),
    getEventVendors(event.id),
    listGuests(event.id),
    listBudgetLines(event.id),
    editor ? getActiveCities() : Promise.resolve([]),
  ]);
  const summary = guestSummary(guests);
  const budget = eventBudget(lines, vendors);
  const booked = vendors.filter((v) => v.booking_status === "confirmed").length;
  const money = (p: number) => formatPaise(p, { currency: event.currency });
  type Vendor = (typeof vendors)[number];

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={Store}
          label={t("stats.vendors")}
          value={t("stats.vendorsValue", { booked, total: vendors.length })}
        />
        <Stat
          icon={Users}
          label={t("stats.guests")}
          value={t("stats.guestsValue", { attending: summary.attendingPeople, invited: summary.invitedPeople })}
        />
        <Stat
          icon={HandCoins}
          label={t("stats.budget")}
          value={t("stats.budgetValue", { booked: money(budget.bookedPaise), planned: money(budget.plannedPaise) })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("vendorsTitle")}</CardTitle>
          <CardDescription>{t("vendorsBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable<Vendor>
            rows={vendors}
            rowKey={(v) => v.enquiry_id}
            caption={t("vendorsTitle")}
            empty={
              <EmptyState
                icon={Store}
                title={t("noVendors")}
                description={role === "owner" ? t("noVendorsOwner") : t("noVendorsMember")}
                action={
                  role === "owner" ? (
                    <Button asChild>
                      <Link href="/search">{t("findVendors")}</Link>
                    </Button>
                  ) : undefined
                }
              />
            }
            columns={[
              {
                key: "listing",
                header: t("colVendor"),
                cell: (v) => (
                  <div className="grid gap-0.5">
                    <span className="font-medium">{v.listing_title}</span>
                    <span className="text-muted-foreground text-xs">{v.vendor_name}</span>
                  </div>
                ),
              },
              { key: "date", header: t("colDate"), cell: (v) => day(v.event_date, locale), hideOnMobile: true },
              {
                key: "status",
                header: t("colStatus"),
                cell: (v) => <StatusBadge status={v.booking_status ?? v.enquiry_status} />,
              },
              {
                key: "money",
                header: t("colPaid"),
                hideOnMobile: true,
                cell: (v) => (v.total_paise ? `${money(v.paid_paise ?? 0)} / ${money(v.total_paise)}` : t("notBooked")),
              },
              {
                key: "open",
                header: "",
                className: "text-right",
                cell: (v) =>
                  role === "viewer" ? null : (
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={
                          role === "owner" && v.booking_item_id
                            ? `/account/bookings/${v.booking_item_id}`
                            : `/account/enquiries/${v.enquiry_id}`
                        }
                      >
                        {t("open")}
                      </Link>
                    </Button>
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {editor ? (
            <EventDetailsForm
              cities={cities.map((c) => ({ id: c.id, name: localizedName(c, locale) }))}
              initial={{
                eventId: event.id,
                title: event.title,
                eventType: event.event_type as "wedding",
                cityId: event.city_id ?? "",
                startDate: event.start_date,
                endDate: event.end_date,
                guestEstimate: event.guest_estimate ? String(event.guest_estimate) : "",
                hostsText: event.hosts_text ?? "",
                venueText: event.venue_text ?? "",
                invitationMessage: event.invitation_message ?? "",
              }}
            />
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">{t("eventType")}</dt>
              <dd>{t(`types.${event.event_type as "wedding"}`)}</dd>
              <dt className="text-muted-foreground">{t("guestEstimate")}</dt>
              <dd>{event.guest_estimate ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("venue")}</dt>
              <dd>{event.venue_text ?? "—"}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-4">
      <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="grid min-w-0">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="font-semibold break-words">{value}</span>
      </div>
    </div>
  );
}

// ---------- guests --------------------------------------------------------------------------
export async function GuestsTab({ event, role }: TabProps) {
  const editor = role !== "viewer";
  const [t, guests] = await Promise.all([getTranslations("events.guests"), listGuests(event.id)]);
  const s = guestSummary(guests);
  type Guest = (typeof guests)[number];

  return (
    <div className="grid gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="guest-summary">
        {[
          ["guests", s.guests],
          ["invitedPeople", s.invitedPeople],
          ["attending", s.attendingPeople],
          ["declined", s.declined],
          ["pending", s.pending],
        ].map(([k, v]) => (
          <div key={k} className="bg-card rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{t(`summary.${k as "guests"}`)}</dt>
            <dd className="text-lg font-semibold" data-testid={`summary-${k}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {editor ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("addTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AddGuestForm eventId={event.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("bulkTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BulkGuestsForm eventId={event.id} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {editor ? <p className="text-muted-foreground text-sm">{t("linksHint")}</p> : null}

      <DataTable<Guest>
        rows={guests}
        rowKey={(g) => g.id}
        caption={t("title")}
        empty={<EmptyState icon={Users} title={t("empty")} description={editor ? t("emptyBody") : undefined} />}
        columns={[
          {
            key: "name",
            header: t("name"),
            cell: (g) => (
              <div className="grid gap-0.5" data-testid="guest-row">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground text-xs">
                  {[g.group_label, g.phone].filter(Boolean).join(" · ") || "—"}
                </span>
              </div>
            ),
          },
          { key: "size", header: t("partySize"), cell: (g) => g.party_size, hideOnMobile: true },
          {
            key: "rsvp",
            header: t("rsvp"),
            cell: (g) => (
              <div className="grid justify-items-start gap-1">
                <span className="flex items-center gap-1">
                  <StatusBadge status={g.rsvp_status} />
                  {g.rsvp_status === "attending" || g.rsvp_status === "maybe" ? (
                    <span className="text-xs" data-testid="guest-count">
                      × {g.attending_count}
                    </span>
                  ) : null}
                </span>
                {g.rsvp_note ? (
                  <span className="text-muted-foreground max-w-56 text-xs break-words">“{g.rsvp_note}”</span>
                ) : null}
                {g.invited_at ? null : <span className="text-muted-foreground text-xs">{t("notShared")}</span>}
              </div>
            ),
          },
          ...(editor
            ? [
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  cell: (g: Guest) => (
                    <div className="grid justify-items-end gap-2">
                      <GuestActions
                        guest={{ id: g.id, name: g.name, phone: g.phone }}
                        shareText={t("shareText", {
                          name: g.name,
                          event: event.title,
                          date: event.start_date,
                          link: "{link}",
                        })}
                      />
                      <HostRsvpForm
                        guestId={g.id}
                        partySize={g.party_size}
                        status={g.rsvp_status}
                        count={g.attending_count}
                      />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

// ---------- budget --------------------------------------------------------------------------
export async function BudgetTab({ event, role, locale }: TabProps) {
  const editor = role !== "viewer";
  const [t, vendors, lines, categories] = await Promise.all([
    getTranslations("events.budget"),
    getEventVendors(event.id),
    listBudgetLines(event.id),
    getBusinessCategories(),
  ]);
  const budget = eventBudget(lines, vendors);
  const money = (p: number) => formatPaise(p, { currency: event.currency });
  const nameOf = new Map(categories.map((c) => [c.id, localizedName(c, locale)]));
  const used = new Set(lines.map((l) => l.business_category_id).filter(Boolean));
  const free = categories.filter((c) => !used.has(c.id)).map((c) => ({ id: c.id, name: localizedName(c, locale) }));
  const canEstimate = !!event.city_id && !!event.guest_estimate;
  type Row = (typeof budget.rows)[number];
  const label = (r: Row) => (r.categoryId ? (nameOf.get(r.categoryId) ?? "—") : (r.label ?? "—"));

  return (
    <div className="grid gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="budget-summary">
        {(
          [
            ["planned", budget.plannedPaise],
            ["booked", budget.bookedPaise],
            ["paid", budget.paidPaise],
            ["remaining", budget.remainingPaise],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="bg-card rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{t(k)}</dt>
            <dd
              className={`text-lg font-semibold ${k === "remaining" && v < 0 ? "text-destructive" : ""}`}
              data-testid={`budget-${k}`}
            >
              {money(v)}
            </dd>
          </div>
        ))}
      </dl>
      {budget.remainingPaise < 0 ? (
        <p className="text-destructive text-sm" role="status">
          {t("over", { amount: money(-budget.remainingPaise) })}
        </p>
      ) : null}

      <DataTable<Row>
        rows={budget.rows}
        rowKey={(r) => r.key}
        caption={t("title")}
        empty={<EmptyState icon={HandCoins} title={t("empty")} description={editor ? t("emptyBody") : undefined} />}
        columns={[
          { key: "label", header: t("category"), cell: (r) => <span className="font-medium">{label(r)}</span> },
          {
            key: "planned",
            header: t("planned"),
            className: "text-right",
            cell: (r) =>
              editor && r.lineId ? (
                <PlannedAmountForm lineId={r.lineId} rupees={paiseToRupees(r.plannedPaise)} label={label(r)} />
              ) : (
                money(r.plannedPaise)
              ),
          },
          { key: "booked", header: t("booked"), className: "text-right", cell: (r) => money(r.bookedPaise) },
          {
            key: "paid",
            header: t("paid"),
            className: "text-right",
            cell: (r) => money(r.paidPaise),
            hideOnMobile: true,
          },
          ...(editor
            ? [
                {
                  key: "remove",
                  header: "",
                  className: "text-right",
                  cell: (r: Row) =>
                    r.lineId ? (
                      <ActionButton
                        action={deleteBudgetLine.bind(null, r.lineId)}
                        label={t("remove")}
                        successMessage={t("removed")}
                        confirm={{
                          title: t("removeTitle"),
                          description: t("removeBody", { label: label(r) }),
                          destructive: true,
                        }}
                      />
                    ) : null,
                },
              ]
            : []),
        ]}
      />

      {editor ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("addTitle")}</CardTitle>
            <CardDescription>{t("addBody")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <AddBudgetLineForm eventId={event.id} categories={free} />
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {canEstimate ? (
                <ActionButton
                  action={fillBudgetFromEstimate.bind(null, event.id)}
                  label={t("fromEstimate")}
                  successMessage={t("estimated")}
                  variant="secondary"
                  testId="budget-from-estimate"
                />
              ) : (
                <Button size="sm" variant="secondary" disabled title={t("estimateNeeds")}>
                  {t("fromEstimate")}
                </Button>
              )}
              <span className="text-muted-foreground text-xs">
                {canEstimate ? t("estimateHint") : t("estimateNeeds")}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------- people --------------------------------------------------------------------------
export async function PeopleTab({ event, role, userId }: TabProps) {
  const owner = role === "owner";
  const [t, members, invitations] = await Promise.all([
    getTranslations("events.people"),
    listMembers(event.id),
    owner ? listEventInvitations(event.id) : Promise.resolve([]),
  ]);
  type Member = (typeof members)[number];

  return (
    <div className="grid gap-6">
      <DataTable<Member>
        rows={members}
        rowKey={(m) => m.user_id}
        caption={t("title")}
        empty={<EmptyState icon={Users} title={t("title")} />}
        columns={[
          {
            key: "name",
            header: t("name"),
            cell: (m) => (
              <div className="grid gap-0.5" data-testid="member-row">
                <span className="font-medium">
                  {m.name}
                  {m.user_id === userId ? ` (${t("you")})` : ""}
                </span>
                {m.email ? <span className="text-muted-foreground text-xs">{m.email}</span> : null}
              </div>
            ),
          },
          {
            key: "role",
            header: t("role"),
            cell: (m) => <Badge variant={m.role === "owner" ? "default" : "gold"}>{t(`roles.${m.role}`)}</Badge>,
          },
          {
            key: "remove",
            header: "",
            className: "text-right",
            cell: (m) =>
              m.role === "owner" ? null : owner || m.user_id === userId ? (
                <ActionButton
                  action={removeEventMember.bind(null, event.id, m.user_id)}
                  label={m.user_id === userId ? t("leave") : t("remove")}
                  successMessage={m.user_id === userId ? t("left") : t("removed")}
                  confirm={{
                    title: m.user_id === userId ? t("leaveTitle") : t("removeTitle"),
                    description: m.user_id === userId ? t("leaveBody") : t("removeBody", { name: m.name }),
                    destructive: true,
                  }}
                />
              ) : null,
          },
        ]}
      />

      {owner ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("inviteTitle")}</CardTitle>
              <CardDescription>{t("inviteBody")}</CardDescription>
            </CardHeader>
            <CardContent>
              <InviteMemberForm eventId={event.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("pendingTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm" data-testid="pending-invitations">
              {invitations.length === 0 ? <p className="text-muted-foreground">{t("noPending")}</p> : null}
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <span className="min-w-0 break-all">
                    {inv.email} · {t(`roles.${inv.role}`)}
                  </span>
                  <ActionButton
                    action={revokeEventInvitation.bind(null, inv.id)}
                    label={t("revoke")}
                    successMessage={t("revoked")}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
