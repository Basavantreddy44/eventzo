import { getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { unassignStaff } from "../actions";
import { zonedDate, zonedTime } from "../lib/jobs";
import type { JobAssignmentView } from "../queries";
import { AssignmentEditForm, AssignStaffForm, JobDetailsForm, PayoutForm } from "./job-forms";

const toRupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/**
 * Staff on one job: who, role, call time, their answer, pay and payout, with
 * edit / unassign / record payout, plus the assign form and the job sheet.
 */
export async function JobTeam({
  job,
  bookingItemId,
  reservationId,
  startsAt,
  endsAt,
  assignments,
  staffOptions,
  locale,
  today,
  idPrefix,
}: {
  job: { id: string; site_address: string | null; instructions: string | null; status: string } | null;
  bookingItemId?: string;
  reservationId?: string;
  startsAt: string;
  endsAt: string;
  assignments: JobAssignmentView[];
  staffOptions: { id: string; label: string }[];
  locale: string;
  today: string;
  idPrefix: string;
}) {
  const t = await getTranslations("staff");
  const finished = new Date(endsAt) <= new Date();
  const cancelled = job?.status === "cancelled";
  const assignedIds = new Set(assignments.filter((a) => a.status !== "declined").map((a) => a.staff_profile_id));
  const available = staffOptions.filter((s) => !assignedIds.has(s.id));

  return (
    <div className="grid gap-4">
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("nobodyYet")}</p>
      ) : (
        <ul className="grid gap-3" data-testid="job-team">
          {assignments.map((a) => {
            const open = a.status === "assigned" || a.status === "accepted" || a.status === "checked_in";
            const payable = a.status !== "declined" && a.paidOut === null && (a.pay_paise ?? 0) > 0;
            return (
              <li key={a.id} className="grid gap-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {a.staffName}
                      {a.role_label ? (
                        <span className="text-muted-foreground font-normal"> · {a.role_label}</span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {a.call_time ? t("callAt", { time: formatDateTime(a.call_time, locale) }) : t("noCallTime")}
                      {a.pay_paise !== null ? ` · ${t("payIs", { amount: formatPaise(a.pay_paise) })}` : ""}
                      {a.paidOut !== null ? ` · ${t("paidOut", { amount: formatPaise(a.paidOut) })}` : ""}
                    </p>
                    {a.staff_note ? <p className="mt-1 text-xs italic">“{a.staff_note}”</p> : null}
                  </div>
                  <StatusBadge status={a.status === "assigned" ? "awaiting_reply" : a.status} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {open && !finished ? (
                    <details className="w-full">
                      <summary className="text-primary cursor-pointer text-xs">{t("editAssignment")}</summary>
                      <div className="pt-2">
                        <AssignmentEditForm
                          idPrefix={`${idPrefix}-${a.id.slice(0, 8)}`}
                          initial={{
                            assignmentId: a.id,
                            roleLabel: a.role_label ?? "",
                            pay: a.pay_paise !== null ? toRupees(a.pay_paise) : "",
                            callDate: a.call_time ? zonedDate(a.call_time) : "",
                            callTime: a.call_time ? zonedTime(a.call_time) : "",
                          }}
                        />
                      </div>
                    </details>
                  ) : null}
                  {open ? (
                    <ActionButton
                      action={unassignStaff.bind(null, a.id)}
                      label={t("unassign")}
                      successMessage={t("unassigned")}
                      confirm={{
                        title: t("unassignTitle"),
                        description: t("unassignBody", { name: a.staffName }),
                        destructive: true,
                      }}
                    />
                  ) : null}
                  {payable ? (
                    <PayoutForm
                      assignmentId={a.id}
                      suggestedRupees={toRupees(a.pay_paise ?? 0)}
                      today={today}
                      idPrefix={`${idPrefix}-${a.id.slice(0, 8)}`}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!cancelled && !finished ? (
        <AssignStaffForm
          jobId={job?.id}
          bookingItemId={bookingItemId}
          reservationId={reservationId}
          staff={available}
          defaultDate={zonedDate(startsAt)}
          idPrefix={idPrefix}
        />
      ) : null}

      {!cancelled ? (
        <details>
          <summary className="text-primary cursor-pointer text-sm">{t("jobDetails")}</summary>
          <div className="pt-3">
            <JobDetailsForm
              jobId={job?.id}
              bookingItemId={bookingItemId}
              reservationId={reservationId}
              initial={{ siteAddress: job?.site_address ?? "", instructions: job?.instructions ?? "" }}
              idPrefix={idPrefix}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
