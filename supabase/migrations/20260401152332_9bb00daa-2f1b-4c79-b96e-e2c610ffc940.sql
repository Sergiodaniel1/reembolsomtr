-- Remove reimbursement_requests from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.reimbursement_requests;
