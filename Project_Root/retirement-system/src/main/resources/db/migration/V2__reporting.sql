-- The report calls this function rather than duplicating aggregation logic in Java.
CREATE FUNCTION member_contribution_summary(p_member_id BIGINT)
RETURNS TABLE(months BIGINT, pensionable_total NUMERIC, employee_total NUMERIC, employer_total NUMERIC)
LANGUAGE sql STABLE AS $$
 SELECT count(DISTINCT payroll_month), coalesce(sum(pensionable_pay),0),
 coalesce(sum(employee_amount),0), coalesce(sum(employer_amount),0)
 FROM contribution WHERE member_id=p_member_id;
$$;
