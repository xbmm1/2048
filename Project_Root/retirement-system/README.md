# Retirement Administration Learning Lab

A runnable example of the Java/Spring, PostgreSQL, batch integration, and Jasper reporting work described in a pension application developer role. All people, employers, and pension rules are fictional. This is an educational application, not a PSPRS implementation.

## Start here

From this directory, with Docker Desktop running Linux containers:

```powershell
docker compose up --build
```

Open [the staff portal](http://localhost:8080). The first build downloads dependencies; wait for `Started RetirementApplication` in the logs.

| Role | Username | Demo password |
| --- | --- | --- |
| Staff | `staff` | `Staff-demo-17!` |
| Independent approver | `approver` | `Approve-demo-17!` |

The Compose file binds to localhost and explicitly enables the `demo` profile. Credentials and seed migrations exist only in that profile. Without it, authentication fails closed until you integrate an identity provider. Do not deploy the demo profile publicly.

## Run Java locally

Prerequisites: a full **JDK 17**, an internet connection for the first Maven Wrapper run, and PostgreSQL 17. Maven itself is not required. Docker is optional for running the application if PostgreSQL is installed locally; Docker is required for the default Testcontainers integration tests.

```powershell
java -version
javac -version
# If necessary, set this to your actual JDK path:
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
docker compose up -d db
$env:SPRING_PROFILES_ACTIVE = 'demo'
$env:DB_PASSWORD = 'local-learning-only'
.\mvnw.cmd spring-boot:run
```

For an existing local PostgreSQL installation, create a **new** database named `retirement` with an application user, skip the Docker command, and set `DB_URL`, `DB_USER`, and `DB_PASSWORD`. Flyway creates the tables. Use a database dedicated to this example.

```powershell
$env:DB_URL = 'jdbc:postgresql://localhost:5432/retirement'
$env:DB_USER = 'retirement'
$env:DB_PASSWORD = 'your-local-password'
$env:SPRING_PROFILES_ACTIVE = 'demo'
.\mvnw.cmd spring-boot:run
```

## Ten-minute walkthrough

1. Sign in as **staff** and open **Members → Alex Morgan** (`DEMO-1001`). Save an estimate as of **2026-01-01**. Alex has 119 service months and is ineligible.
2. Open **Contributions** and upload `samples/contributions-valid.csv`. Its one row supplies December 2025, the 120th service month. The result should be **POSTED**.
3. Upload the same file again. It returns the original import ID without posting twice. Upload `samples/contributions-invalid.csv`: it is **REJECTED**, with errors, and posts no rows, including its valid first row.
4. Return to Alex and save a new estimate as of **2026-01-01**. It shows **120 months**, **$60,000 average annual pay**, **$12,000 annual pension**, and **$1,000 monthly pension**. The previous estimate is unchanged.
5. Select **Create retirement request**, then **Submit for approval**. A draft is not yet in the approval queue.
6. Sign out and sign in as **approver**. Open **Requests → Awaiting review**, inspect the saved calculation, enter review comments, and approve.
7. Alex is now **RETIRED**. Download the estimate PDF and inspect **Audit trail** for each committed step.

Jordan is too young and lacks service; Casey lacks 36 months of salary history. These provide additional ineligible examples. To repeat Alex's complete workflow, use a fresh demo database; the ledger and history intentionally have no delete button.

## What to read next

- [Architecture and fictional rules](docs/architecture.md): modules, schema, calculations, locks, transaction boundaries.
- [REST examples](docs/api.md): session authentication, CSRF, endpoints, errors.
- [Developer guide](docs/development.md): Eclipse, Jasper Studio, tests, troubleshooting, and recovery.
- [Learning backlog](docs/backlog.md): Jira-style stories, acceptance criteria, debugging exercises.
- [AWS deployment mapping](docs/aws.md): ECS, RDS, Secrets Manager, CloudWatch; no infrastructure is created.
- [Verification record](docs/verification.md): what was actually tested in the implementation environment.

## Commands

```powershell
.\mvnw.cmd test       # Calculator and PDF tests; no database needed
.\mvnw.cmd verify     # Also integration tests, PostgreSQL 17 via Testcontainers/Docker
.\mvnw.cmd package   # Builds target/retirement-system-1.0.0-SNAPSHOT.jar
docker compose stop  # Stops the local demo; preserves its data
```

GitHub Actions runs `verify` on changes to this project. Its workflow lives at the repository root so GitHub discovers it.

## Deliberate boundaries

One organization, one application, a simple staff portal, and a small synchronous batch import. There are no real pension rules, benefit payments, external SaaS calls, personal identifiers such as SSNs, cloud resources, or production identity integration. Imported pay is a monthly total, and each member can have one contribution per calendar month. Corrections, multiple employers in one month, refunds, disability retirement, beneficiary elections, and actuarial calculations are future exercises.
