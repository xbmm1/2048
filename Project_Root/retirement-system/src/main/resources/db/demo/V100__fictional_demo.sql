INSERT INTO employer(id,name) VALUES (1,'Demo Mesa Fire District'),(2,'Demo Canyon Police Department');
INSERT INTO member(id,employer_id,member_number,name,birth_date,employment_start) VALUES
 (1,1,'DEMO-1001','Alex Morgan','1965-03-15','2000-01-01'),
 (2,2,'DEMO-1002','Jordan Rivera','1990-06-20','2022-01-01'),
 (3,1,'DEMO-1003','Casey Chen','1960-02-10','2025-01-01');
-- Alex has 119 months: importing samples/contributions-valid.csv supplies month 120.
INSERT INTO contribution(member_id,payroll_month,pensionable_pay,employee_amount,employer_amount)
SELECT 1,m,5000,500,750 FROM generate_series('2016-01-01'::date,'2025-11-01'::date,interval '1 month') m;
INSERT INTO contribution(member_id,payroll_month,pensionable_pay,employee_amount,employer_amount)
SELECT 2,m,4200,420,630 FROM generate_series('2022-01-01'::date,'2025-12-01'::date,interval '1 month') m;
INSERT INTO contribution(member_id,payroll_month,pensionable_pay,employee_amount,employer_amount)
SELECT 3,m,4500,450,675 FROM generate_series('2025-01-01'::date,'2025-12-01'::date,interval '1 month') m;
SELECT setval(pg_get_serial_sequence('member','id'),3);
SELECT setval(pg_get_serial_sequence('employer','id'),2);
