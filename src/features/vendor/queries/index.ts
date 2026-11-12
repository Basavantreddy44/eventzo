import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Vendor-side reads. Every query runs with the user's session, so RLS limits
 * results to their own organisation (and, for managers, their branches).
 */

export async function getBusinessProfile(organizationId: string) {
  const supabase = await createClient();
  const [org, profile] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, legal_name, status, verification_status")
      .eq("id", organizationId)
      .single(),
    supabase.from("business_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (org.error) throw new Error(`Failed to load organisation: ${org.error.message}`);
  return { organization: org.data, profile: profile.data };
}

export async function getDocuments(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_documents")
    .select("id, document_type, file_name, status, rejection_reason, created_at, reviewed_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  return data ?? [];
}

export async function getBranches(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, city_id, area_id, address_line1, address_line2, pincode, phone, is_primary, active")
    .eq("organization_id", organizationId)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw new Error(`Failed to load branches: ${error.message}`);
  return data ?? [];
}

export async function getListings(organizationId: string, branchId: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("services")
    .select(
      "id, slug, title, status, price_type, price_unit, base_price_paise, max_price_paise, currency, branch_id, updated_at, service_categories(name, business_categories(icon)), service_media(storage_path, is_cover)",
    )
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load listings: ${error.message}`);
  return data ?? [];
}

export async function getListingForEdit(organizationId: string, serviceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*, venue_details(*), catering_details(*), service_media(id, storage_path, is_cover, sort_order)")
    .eq("organization_id", organizationId)
    .eq("id", serviceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load listing: ${error.message}`);
  return data;
}

export async function getResources(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookable_resources")
    .select(
      "id, name, kind, allocation_mode, capacity, service_id, branch_id, staff_profile_id, setup_buffer_min, breakdown_buffer_min, travel_buffer_min, active",
    )
    .eq("organization_id", organizationId)
    .order("active", { ascending: false })
    .order("name");
  if (error) throw new Error(`Failed to load resources: ${error.message}`);
  return data ?? [];
}

export async function getTeam(organizationId: string, isOwner: boolean) {
  const supabase = await createClient();
  const [members, invitations] = await Promise.all([
    supabase.rpc("org_member_directory", { p_organization_id: organizationId }),
    isOwner
      ? supabase
          .from("organization_invitations")
          .select("id, email, role, branch_ids, expires_at, created_at")
          .eq("organization_id", organizationId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (members.error) throw new Error(`Failed to load team: ${members.error.message}`);
  if (invitations.error) throw new Error(`Failed to load invitations: ${invitations.error.message}`);
  return { members: members.data ?? [], invitations: invitations.data ?? [] };
}

/** Go-live readiness, mirroring the database rule in private.try_activate_organization(). */
export async function getReadiness(organizationId: string) {
  const supabase = await createClient();
  const [profile, published, documents] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("description, contact_phone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "published"),
    supabase
      .from("business_documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
  ]);
  return {
    profileComplete: !!(profile.data?.description?.trim() && profile.data?.contact_phone),
    hasPublishedListing: (published.count ?? 0) > 0,
    documentsUploaded: (documents.count ?? 0) > 0,
  };
}
