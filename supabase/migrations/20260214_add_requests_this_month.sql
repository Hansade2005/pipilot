-- Add monthly request counter to wallet table for rate limiting
-- This tracks number of requests per month independently of credits

-- Add the column (defaults to 0 for existing users)
ALTER TABLE public.wallet
ADD COLUMN IF NOT EXISTS requests_this_month integer NOT NULL DEFAULT 0;

-- Update the monthly reset function to also reset request counter
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void AS $$
BEGIN
  -- Reset monthly usage and request count for wallets that haven't been reset this month
  UPDATE public.wallet
  SET
    credits_used_this_month = 0,
    requests_this_month = 0,
    last_reset_date = CURRENT_DATE,
    -- Grant monthly credits based on plan
    -- IMPORTANT: These values MUST match credit-manager.ts constants
    credits_balance = CASE
      WHEN current_plan = 'free' THEN 150
      WHEN current_plan = 'creator' THEN credits_balance + 1000
      WHEN current_plan = 'collaborate' THEN credits_balance + 2500
      WHEN current_plan = 'scale' THEN credits_balance + 5000
      ELSE credits_balance
    END
  WHERE last_reset_date < DATE_TRUNC('month', CURRENT_DATE);

  -- Log the reset transactions
  INSERT INTO public.transactions (user_id, amount, type, description, credits_before, credits_after)
  SELECT
    w.user_id,
    CASE
      WHEN w.current_plan = 'free' THEN 150
      WHEN w.current_plan = 'creator' THEN 1000
      WHEN w.current_plan = 'collaborate' THEN 2500
      WHEN w.current_plan = 'scale' THEN 5000
      ELSE 0
    END,
    'monthly_reset',
    'Monthly credit grant for ' || w.current_plan || ' plan',
    w.credits_balance - CASE
      WHEN w.current_plan = 'free' THEN 150
      WHEN w.current_plan = 'creator' THEN 1000
      WHEN w.current_plan = 'collaborate' THEN 2500
      WHEN w.current_plan = 'scale' THEN 5000
      ELSE 0
    END,
    w.credits_balance
  FROM public.wallet w
  WHERE w.last_reset_date = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.wallet.requests_this_month IS 'Number of AI requests made this month. Reset on monthly_reset. Checked against MAX_REQUESTS_PER_MONTH per plan.';
COMMENT ON FUNCTION public.reset_monthly_credits() IS 'Reset monthly credit usage, request count, and grant new credits. Credits: Free=150, Creator=1000, Collaborate=2500, Scale=5000. Request limits: Free=20, Creator=250, Collaborate=600, Scale=2000.';
