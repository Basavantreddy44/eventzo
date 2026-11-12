-- =============================================================================
-- 1100 · Storage: private bucket for vendor KYC / business documents
-- Object path convention: {organization_id}/{random-uuid}.{ext}
-- Files are only ever served through short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-documents',
  'business-documents',
  false,
  10485760,  -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy business_documents_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-documents'
    and (
      public.has_org_role(private.try_uuid((storage.foldername(name))[1]), array['owner'])
      or public.has_platform_permission('verification.manage')
    )
  );

create policy business_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-documents'
    and public.has_org_role(private.try_uuid((storage.foldername(name))[1]), array['owner'])
  );

create policy business_documents_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-documents'
    and public.has_org_role(private.try_uuid((storage.foldername(name))[1]), array['owner'])
  );
-- No UPDATE policy: documents are replaced by uploading a new object.
