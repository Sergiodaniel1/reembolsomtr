-- Remove the trigger
DROP TRIGGER IF EXISTS validate_reimbursement_status ON public.reimbursement_requests;

-- Remove the function with CASCADE
DROP FUNCTION IF EXISTS public.validate_status_transition() CASCADE;
