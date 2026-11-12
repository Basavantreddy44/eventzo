/** Guest-list maths and invitation links (pure). */

export type GuestRsvp = { party_size: number; rsvp_status: string; attending_count: number; invited_at: string | null };

export type GuestSummary = {
  guests: number;
  invitedPeople: number;
  linksShared: number;
  attendingPeople: number;
  maybePeople: number;
  declined: number;
  pending: number;
};

export function guestSummary(list: GuestRsvp[]): GuestSummary {
  const s: GuestSummary = {
    guests: list.length,
    invitedPeople: 0,
    linksShared: 0,
    attendingPeople: 0,
    maybePeople: 0,
    declined: 0,
    pending: 0,
  };
  for (const g of list) {
    s.invitedPeople += g.party_size;
    if (g.invited_at) s.linksShared += 1;
    if (g.rsvp_status === "attending") s.attendingPeople += g.attending_count;
    else if (g.rsvp_status === "maybe") s.maybePeople += g.attending_count;
    else if (g.rsvp_status === "declined") s.declined += 1;
    else s.pending += 1;
  }
  return s;
}

/** Absolute RSVP link for a guest token (locale-prefixed except for the default locale). */
export function inviteUrl(siteUrl: string, locale: string, token: string, defaultLocale = "en"): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}${locale === defaultLocale ? "" : `/${locale}`}/invite/${token}`;
}

/**
 * wa.me share link. With a phone it opens that chat; without one WhatsApp asks
 * the host whom to send it to. No WhatsApp provider is needed for this.
 */
export function whatsappShareUrl(phone: string | null, text: string): string {
  const digits = phone ? phone.replace(/\D/g, "") : "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
