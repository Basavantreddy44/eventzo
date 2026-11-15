-- =============================================================================
-- 2100 · Roadmap A8: legal pages + recorded consent
--   * Draft policies (version 0.1; any version below 1.0 is shown as a draft) written from how Eventzo actually
--     works. They are DRAFTS for the owner's lawyer/CA to review; every page
--     says so until a reviewed version is published. Bracketed [..] items are
--     facts only the owner can supply (legal entity, address, grievance officer).
--   * Sign-up records consent to the Terms and Privacy Policy versions in force.
--   * Creating a business records consent to the Vendor Agreement.
-- =============================================================================

alter type public.consent_purpose add value if not exists 'vendor_agreement';

-- Latest published version of a policy (English is the fallback language).
create or replace function public.current_policy(p_type public.policy_type, p_locale public.app_locale default 'en')
returns table (id uuid, version text, title text, body_md text, effective_from timestamptz, locale public.app_locale)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.version, p.title, p.body_md, p.effective_from, p.locale
  from public.policy_versions p
  where p.policy_type = p_type and p.published_at is not null and p.published_at <= now()
    and p.locale in (p_locale, 'en')
  order by (p.locale = p_locale) desc, p.effective_from desc, p.published_at desc
  limit 1;
$$;
revoke all on function public.current_policy(public.policy_type, public.app_locale) from public;
grant execute on function public.current_policy(public.policy_type, public.app_locale) to anon, authenticated;

-- Sign-up: when the form's consent box was ticked, record it against the
-- versions in force (the box is required by the app, so this is every sign-up
-- made through Eventzo's own form).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale public.app_locale := 'en';
  v_meta_locale text := new.raw_user_meta_data ->> 'preferred_locale';
begin
  if v_meta_locale in ('en', 'kn', 'hi') then
    v_locale := v_meta_locale::public.app_locale;
  end if;

  insert into public.profiles (id, email, full_name, preferred_locale)
  values (
    new.id,
    new.email,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    v_locale
  );

  -- Every new account starts as a customer. Vendor access comes from
  -- organisation membership; admin roles are granted explicitly.
  insert into public.user_role_assignments (user_id, role_id)
  select new.id, r.id from public.roles r where r.code = 'customer';

  if coalesce((new.raw_user_meta_data ->> 'accepted_policies')::boolean, false) then
    insert into public.consent_records (user_id, purpose, granted, policy_version_id, source)
    select new.id, c.purpose::public.consent_purpose, true,
           (select cp.id from public.current_policy(c.policy::public.policy_type, v_locale) cp), 'signup'
    from (values ('terms', 'terms_of_service'), ('privacy', 'privacy_policy')) as c(purpose, policy);
  end if;

  return new;
end;
$$;

-- ---------- draft texts (v0.1, English) -----------------------------------
insert into public.policy_versions (policy_type, version, locale, title, body_md, effective_from, published_at)
values
('terms_of_service', '0.1', 'en', 'Terms of Use', $md$
## About Eventzo
Eventzo is an online marketplace operated by [Legal entity name], [registered address] ("Eventzo", "we"). It helps you find event vendors such as function halls, kalyana mantapas, caterers and decorators, ask them for quotes and book them. Each vendor is an independent business. The vendor, not Eventzo, provides the service you book.

## Your account
- You must be at least 18 years old and give true details.
- Keep your password or login link private. You are responsible for what happens in your account.
- We may suspend or close an account that breaks these terms, misuses the platform or harms other users.

## Enquiries, holds and quotes
- An enquiry may hold a vendor's date for up to 48 hours while the vendor replies. The hold ends automatically if the vendor does not reply.
- A quote is the vendor's offer. When you accept it, the price, inclusions and cancellation policy shown are saved with your booking and do not change later.

## Bookings and payments
- A booking is confirmed when the advance shown on the booking is paid. You pay the balance by the date shown.
- Payments made online are processed by our payment partner (Razorpay). Payments you make directly to the vendor are recorded by the vendor.
- Each vendor's booking is separate. One vendor accepting, declining or cancelling does not affect your other bookings.

## Cancellations and refunds
Refunds follow the cancellation policy saved on your booking. See the Refund & Cancellation Policy.

## What you must not do
Post false information, harass anyone, avoid the platform to escape fees after meeting a vendor here, upload content you have no right to, or try to break or overload the service.

## Content
You keep ownership of what you upload (photos, reviews, messages). You allow Eventzo to show it on the platform to provide the service. Do not upload photos of people without their permission.

## Liability
Eventzo provides the platform with reasonable care but does not guarantee any vendor's service. To the extent the law allows, Eventzo is not liable for a vendor's acts or omissions. Nothing here limits rights you have under the Consumer Protection Act, 2019 or the Consumer Protection (E-Commerce) Rules, 2020.

## Complaints
Contact our Grievance Officer: [name], [email], [phone]. We acknowledge complaints within 48 hours and aim to resolve them within one month.

## Law
These terms are governed by the laws of India. Courts at [city], Karnataka have jurisdiction.

## Changes
We may update these terms. The version and date are shown on this page; we will ask you to accept important changes.
$md$, now(), now()),

('privacy_policy', '0.1', 'en', 'Privacy Policy', $md$
## Who we are
[Legal entity name], [registered address], is the Data Fiduciary for personal data processed on Eventzo under the Digital Personal Data Protection Act, 2023 ("DPDP Act").

## What we collect
- **Account:** name, email, mobile number, preferred language.
- **Events and bookings:** event dates, guest counts, enquiries, quotes, bookings, messages with vendors, and payment records (amount, status, reference). We do not store your card or UPI PIN; our payment partner handles these.
- **Guests you add:** names and phone numbers of guests you invite. Add them only if you are allowed to.
- **Vendors:** business details, staff details and verification documents (kept in private storage).
- **Technical:** sign-in records and basic logs needed for security.

## Why we use it
To run your account, connect you with vendors, process bookings and payments, send the updates you choose (in-app, email, WhatsApp), keep the platform safe, and meet legal duties (for example tax and consumer law). We do not sell your personal data.

## Who we share it with
- **The vendor you enquire with or book**, only what they need (your contact details are shown once a booking is in progress).
- **Service providers** that run Eventzo for us: hosting and database (Supabase), website hosting (Vercel), payments (Razorpay), messaging (WhatsApp Business by Meta) and email. They may only use the data to provide their service to us.
- **Authorities** when the law requires it.

## WhatsApp and email
We send WhatsApp messages only if you turn them on, and you can turn them off at any time in Account → Notifications. Each choice is recorded.

## How long we keep it
While your account is active, and afterwards only as long as the law requires (for example payment and tax records) or to resolve disputes.

## Your rights
You can ask to access, correct or erase your personal data, withdraw consent, and nominate someone to act for you, as the DPDP Act allows. Write to our Grievance Officer: [name], [email]. If you are not satisfied, you may complain to the Data Protection Board of India.

## Security
Data is encrypted in transit, access is limited by role, every staff view of personal data is logged, and documents are kept in private storage with short-lived links.

## Children
Eventzo is for adults. We do not knowingly create accounts for children.
$md$, now(), now()),

('refund_policy', '0.1', 'en', 'Refund & Cancellation Policy', $md$
## The policy saved on your booking applies
Every listing shows its cancellation policy before you book, and that policy is saved on your booking. It does not change if the vendor edits the listing later.

## If you cancel
The refund depends on how many days before the event you cancel, counted in Indian time:

| Policy | 30 days or more | 7 to 29 days | 1 to 6 days | Less than 1 day |
|---|---|---|---|---|
| Flexible | 100% | 100% | 50% | 0% |
| Moderate | 100% | 50% | 0% | 0% |
| Strict | 50% | 0% | 0% | 0% |

Before you confirm a cancellation, Eventzo shows you the exact refund amount.

## If the vendor cancels
You get a 100% refund of everything you paid for that booking. Your other bookings are not affected.

## If an advance is not paid in time
An unconfirmed booking expires and the date is released. If a payment arrives after expiry, it is refunded in full.

## How refunds are paid
- **Paid online:** refunded to the original payment method through Razorpay, usually within 5–7 working days after it is issued.
- **Paid directly to the vendor:** the vendor refunds you and records it on Eventzo with a reference.

## Questions or disputes
Contact our Grievance Officer: [name], [email], [phone].
$md$, now(), now()),

('vendor_agreement', '0.1', 'en', 'Vendor Agreement', $md$
## Who this is for
Businesses that list services on Eventzo ("vendor"), and the person who registers the business on its behalf.

## Your business and listing
- Give true business details, prices, photos and capacities, and keep them up to date.
- Your listings go live only after Eventzo verifies your documents. Eventzo may ask for more documents, ask for changes, or decline verification.
- Upload only photos and content you own or may use. Get permission from people shown in photos.

## Enquiries and availability
- Reply to enquiries promptly. An enquiry holds your date for up to 48 hours; if you don't reply, the hold ends.
- Keep your Eventzo calendar accurate, including bookings you take outside Eventzo, so customers are not double-booked.

## Quotes and bookings
- A quote you send is an offer. When the customer accepts and pays the advance, the booking is confirmed on the terms in the quote, including your cancellation policy.
- If you cancel a confirmed booking, the customer gets a full refund of what they paid for it. Repeated cancellations may lead to suspension.

## Payments, fees and tax
- Online payments are processed by Razorpay. [Commission or fee terms and settlement timing — to be confirmed before online payments go live.]
- You are responsible for your own taxes, including GST on your services. Eventzo's receipts are payment receipts, not tax invoices.

## Conduct
Do not ask customers to pay outside Eventzo to avoid fees, share their data for other purposes, or post false reviews. Treat customers' personal data only as needed to deliver the booking.

## Suspension
Eventzo may suspend or close a listing or business for false information, repeated cancellations, complaints or breach of this agreement. Existing confirmed bookings are honoured unless it is unsafe to do so.

## Law
Governed by the laws of India; courts at [city], Karnataka.
$md$, now(), now());
