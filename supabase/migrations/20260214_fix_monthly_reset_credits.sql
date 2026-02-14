-- Fix monthly credit reset function to match application-level credit allocations
-- Previous values (20/50/75/150) were outdated and mismatched with credit-manager.ts
-- New values: Free=50, Creator=1000, Collaborate=2500, Scale=5000
-- Also fixes new user signup credits to match free plan allocation

-- Update the monthly reset function with correct credit values
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void AS $$
BEGIN
  -- Reset monthly usage for wallets that haven't been reset this month
  UPDATE public.wallet
  SET
    credits_used_this_month = 0,
    last_reset_date = CURRENT_DATE,
    -- Grant monthly credits based on plan
    -- IMPORTANT: These values MUST match credit-manager.ts constants
    credits_balance = CASE
      WHEN current_plan = 'free' THEN 50
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
      WHEN w.current_plan = 'free' THEN 50
      WHEN w.current_plan = 'creator' THEN 1000
      WHEN w.current_plan = 'collaborate' THEN 2500
      WHEN w.current_plan = 'scale' THEN 5000
      ELSE 0
    END,
    'monthly_reset',
    'Monthly credit grant for ' || w.current_plan || ' plan',
    w.credits_balance - CASE
      WHEN w.current_plan = 'free' THEN 50
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

-- Update the new user signup trigger to give correct free plan credits
CREATE OR REPLACE FUNCTION public.create_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallet (user_id, credits_balance, current_plan)
  VALUES (NEW.id, 50, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.reset_monthly_credits() IS 'Reset monthly credit usage and grant new credits based on plan. Values: Free=50, Creator=1000, Collaborate=2500, Scale=5000';
