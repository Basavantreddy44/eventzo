-- Roadmap S4/V11: "Request changes" as a verification outcome. Its own migration
-- because a new enum value can't be used in the transaction that adds it.
alter type public.verification_status add value if not exists 'changes_requested' after 'pending';
