# Development, verification, and troubleshooting

## Eclipse

1. Install a JDK 17 and set Eclipse **Installed JREs** to its JDK directory.
2. Import **Existing Maven Projects**, selecting this directory and `pom.xml`.
3. Run `RetirementApplication` as a Java application with `SPRING_PROFILES_ACTIVE=demo`, `DB_URL`, `DB_USER`, and `DB_PASSWORD` in the launch environment.
4. Set breakpoints in `ImportProcessor.process`, `BenefitCalculator.calculate`, and `RetirementService.review`. Follow a CSV row through validation and transaction commit.
5. Run JUnit tests from Eclipse or use Maven Wrapper for the same build as CI. Amazon WorkSpaces can host this same IDE setup; there is no WorkSpaces-specific application code.

## Jasper Studio

The editable template is `src/main/resources/reports/member-summary.jrxml`. Use Jaspersoft Studio with JasperReports **7.x** format support and a compatible 7.0.8 runtime. Jasper 6 and 7 JRXML formats differ; do not overwrite this template with a 6.x serialization.

Open the JRXML as an existing report, select Java expressions, use an empty-record data source, and supply its string parameters for preview. The application calls a PostgreSQL reporting function first, then passes the resulting totals into the template; Studio does not need access to member data for layout editing. `ReportTest` compiles the actual template, checks its text, and renders `target/qa/member-summary.png` for visual review.

## Tests

- `mvnw test`: eight deterministic calculation cases and a real Jasper/PDF rendering test.
- `mvnw verify`: additionally starts PostgreSQL 17 through Testcontainers and tests migrations, function/reconciliation results, atomic imports, duplicate protection, immutable history, request transitions, concurrent approvals, security, and rendered portal pages.
- CI fails when Docker is unavailable; integration tests are not silently skipped.
- For an explicitly provisioned **disposable** PostgreSQL 17 test database, set `TEST_DATABASE_URL`, `TEST_DATABASE_USER`, and `TEST_DATABASE_PASSWORD` before `verify`. Tests insert synthetic fixtures into that database. Do not point these variables at a valuable database.

```powershell
$env:TEST_DATABASE_URL = 'jdbc:postgresql://localhost:55432/retirement_test'
$env:TEST_DATABASE_USER = 'retirement'
$env:TEST_DATABASE_PASSWORD = 'test-password'
.\mvnw.cmd verify
```

The CI job uses Testcontainers by leaving those variables unset. Tests create distinct members so integration tests can be repeated on a disposable external database. Surefire holds unit results; Failsafe holds integration results. Inspect `target/qa` after report tests.

## Common failures

| Symptom | Check |
| --- | --- |
| `javac` missing | Install/select a full JDK 17; a Java runtime alone cannot compile |
| Wrapper cannot download | Maven Central access, proxy settings in Maven `settings.xml`, JAVA_HOME |
| Port 5432 already used | Use your dedicated local database or change Compose's host port and DB_URL |
| Database login rejected | DB_USER/DB_PASSWORD and the password used when the volume was first created |
| No members or login unavailable | Enable `demo` against a fresh demo database |
| 403 on a POST | Correct role and a fresh CSRF token for the current session |
| 409 on a decision | Refresh the request; another decision or newer version already exists |
| Import REJECTED | Read row errors; no contribution from that file was committed |
| PDF generation fails | Run `ReportTest`; inspect JRXML format and Java/font dependencies |
| Docker tests cannot start | Start Docker Desktop with Linux containers, or use the explicit disposable database override |

## Batch operations and recovery

An import request saves the original bytes as text and its fingerprint before launching a job. Unexpected failures become FAILED, while business validation problems become REJECTED. A process crash can leave RECEIVED. Exact replay intentionally returns the existing file instead of blindly rerunning it.

This version does not expose a web restart control. For a failed/stale import, inspect the Spring Batch execution metadata and logs, reconcile `contribution.import_id`, and identify the cause before changing anything. For the learning walkthrough, correct a rejected CSV and upload the changed file, or reproduce a runtime failure in a fresh disposable database. A controlled, audited job-recovery endpoint is a backlog exercise, not an automatic retry that could hide a production issue.

`sql/reconciliation.sql` reports posted rows and totals and checks that rejected/failed imports have no ledger entries. Use it before and after experiments. Never repair a posted import by editing historical contribution values; a real system needs reversal/adjustment entries and reconciliation policy.

## Production gaps to study

Replace demo authentication with an identity provider, apply organization/member authorization, split migration and application database privileges, migrate Batch metadata through a controlled schema process, restrict raw import retention, add asynchronous queueing/recovery, monitor job health, and establish backups/restoration tests. A cloud diagram alone does not supply those controls.
