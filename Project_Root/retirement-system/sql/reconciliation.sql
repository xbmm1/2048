-- Compare file row counts against actual posted ledger entries.
-- Seed contributions have no import_id and are intentionally excluded.
SELECT f.id, f.filename, f.status, f.row_count,
       count(c.id) AS posted_rows,
       coalesce(sum(c.employee_amount),0) AS employee_total,
       coalesce(sum(c.employer_amount),0) AS employer_total,
       CASE WHEN f.status='POSTED' THEN count(c.id)=f.row_count
            ELSE count(c.id)=0 END AS reconciled
FROM import_file f LEFT JOIN contribution c ON c.import_id=f.id
GROUP BY f.id ORDER BY f.id;

-- Find service gaps. Gaps are not granted service credit in LEARNING-1.0.
WITH history AS (
 SELECT member_id,payroll_month,lag(payroll_month) OVER(PARTITION BY member_id ORDER BY payroll_month) AS previous
 FROM contribution
)
SELECT member_id,previous,payroll_month FROM history
WHERE payroll_month > previous + interval '1 month';
