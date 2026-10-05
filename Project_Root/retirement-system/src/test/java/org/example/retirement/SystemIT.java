package org.example.retirement;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import org.example.retirement.benefit.BenefitService;
import org.example.retirement.contribution.ImportService;
import org.example.retirement.member.MemberService;
import org.example.retirement.reporting.ReportService;
import org.example.retirement.retirement.RetirementService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
class SystemIT {
  // External URL is ONLY for an explicitly provisioned disposable test database.
  static final String external = System.getenv("TEST_DATABASE_URL");
  static final PostgreSQLContainer postgres =
      external == null ? new PostgreSQLContainer("postgres:17") : null;

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    if (postgres != null) postgres.start();
    registry.add(
        "spring.datasource.url", () -> external != null ? external : postgres.getJdbcUrl());
    registry.add(
        "spring.datasource.username",
        () ->
            external != null
                ? System.getenv().getOrDefault("TEST_DATABASE_USER", "retirement")
                : postgres.getUsername());
    registry.add(
        "spring.datasource.password",
        () ->
            external != null
                ? System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "")
                : postgres.getPassword());
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired ImportService imports;
  @Autowired BenefitService benefits;
  @Autowired RetirementService retirement;
  @Autowired MemberService members;
  @Autowired ReportService reports;
  @Autowired MockMvc mvc;
  @Autowired WebApplicationContext context;
  private long memberId;
  private String number;

  @BeforeEach
  void fixture() {
    mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    number = "TEST-" + UUID.randomUUID().toString().substring(0, 12);
    memberId =
        jdbc.queryForObject(
            "insert into member(employer_id,member_number,name,birth_date,employment_start) values"
                + " (1,?,'Test Member','1960-01-01','2000-01-01') returning id",
            Long.class,
            number);
    jdbc.update(
        "insert into"
            + " contribution(member_id,payroll_month,pensionable_pay,employee_amount,employer_amount)"
            + " select ?,m,5000,500,750 from"
            + " generate_series('2016-01-01'::date,'2025-11-01'::date,interval '1 month') m",
        memberId);
  }

  static void login(String name, String... roles) {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(
                name, "", AuthorityUtils.createAuthorityList(roles)));
  }

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  private String header() {
    return "member_number,payroll_month,pensionable_pay,employee_contribution,employer_contribution\n";
  }

  private byte[] csv(String body) {
    return (header() + body).getBytes(StandardCharsets.UTF_8);
  }

  private ImportService.ImportView postMonth() {
    return imports.upload("test.csv", csv(number + ",2025-12,5000,500,750\n"));
  }

  private RetirementService.Request submitted() {
    postMonth();
    var estimate = benefits.create(memberId, LocalDate.of(2026, 1, 1));
    var request = retirement.create(estimate.id());
    return retirement.submit(request.id(), request.version());
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void fullWorkflowAndReconciliation() throws Exception {
    var file = postMonth();
    assertThat(file.status()).isEqualTo("POSTED");
    var totals = jdbc.queryForMap("select * from member_contribution_summary(?)", memberId);
    assertThat(((Number) totals.get("months")).longValue()).isEqualTo(120);
    String query = Files.readString(Path.of("sql/reconciliation.sql")).split(";")[0];
    assertThat(jdbc.queryForList(query))
        .allSatisfy(row -> assertThat(row.get("reconciled")).isEqualTo(true));
    var estimate = benefits.create(memberId, LocalDate.of(2026, 1, 1));
    assertThat(estimate.annualPension()).isEqualByComparingTo("12000");
    var request = retirement.create(estimate.id());
    request = retirement.submit(request.id(), request.version());
    login("approver", "ROLE_APPROVER");
    request = retirement.review(request.id(), request.version(), true, "Verified service and pay.");
    assertThat(request.status()).isEqualTo("APPROVED");
    assertThat(members.get(memberId).status()).isEqualTo("RETIRED");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from audit_event where entity_type='request' and entity_id=?",
                Long.class,
                request.id()))
        .isEqualTo(3);
    assertThat(new String(reports.summary(estimate.id()), 0, 4, StandardCharsets.US_ASCII))
        .isEqualTo("%PDF");
    mvc.perform(get("/requests/" + request.id())).andExpect(status().isOk());
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void oneInvalidRowRejectsEntireFileAndPersistsErrors() {
    var file =
        imports.upload(
            "bad.csv", csv(number + ",2025-12,5000,500,750\nMISSING,2025-12,5000,500,750\n"));
    assertThat(file.status()).isEqualTo("REJECTED");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from contribution where import_id=?", Long.class, file.id()))
        .isZero();
    assertThat(imports.rows(file.id(), 0, 20).items())
        .anyMatch(row -> row.error() != null && row.error().contains("Unknown"));
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void repeatedFileAndOverlappingMonthCannotDoublePost() {
    var first = postMonth();
    assertThat(postMonth().id()).isEqualTo(first.id());
    assertThat(
            imports
                .upload("different.csv", csv(number + ",2025-12,5000.00,500.00,750.00\n"))
                .status())
        .isEqualTo("REJECTED");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from contribution where member_id=?", Long.class, memberId))
        .isEqualTo(120);
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void badAmountsDuplicateRowsAndMalformedCsvDoNotPost() {
    assertThat(imports.upload("negative.csv", csv(number + ",2025-12,-1,0,0\n")).status())
        .isEqualTo("REJECTED");
    assertThat(
            imports
                .upload(
                    "duplicate.csv", csv(number + ",2025-12,1,0,0\n" + number + ",2025-12,1,0,0\n"))
                .status())
        .isEqualTo("REJECTED");
    assertThat(imports.upload("quote.csv", csv("\"unterminated")).status()).isEqualTo("REJECTED");
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void snapshotAndAuditCannotBeModified() {
    var estimate = benefits.create(memberId, LocalDate.of(2026, 1, 1));
    postMonth();
    assertThat(benefits.get(estimate.id()).serviceMonths()).isEqualTo(119);
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "update benefit_estimate set service_months=999 where id=?", estimate.id()))
        .hasMessageContaining("append-only");
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "delete from audit_event where entity_type='estimate' and entity_id=?",
                    estimate.id()))
        .hasMessageContaining("append-only");
  }

  @Test
  @WithMockUser(
      username = "staff",
      roles = {"STAFF", "APPROVER"})
  void ownRequestAndStaleVersionsAreRejected() {
    var request = submitted();
    assertThatThrownBy(
            () -> retirement.review(request.id(), request.version(), true, "Self review"))
        .hasMessageContaining("own request");
    login("reviewer", "ROLE_APPROVER");
    assertThatThrownBy(() -> retirement.review(request.id(), request.version() - 1, true, "Stale"))
        .hasMessageContaining("Refresh");
    retirement.review(request.id(), request.version(), false, "Missing information");
    assertThat(members.get(memberId).status()).isEqualTo("ACTIVE");
    assertThatThrownBy(() -> retirement.review(request.id(), request.version(), true, "Again"))
        .hasMessageContaining("Refresh");
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void concurrentReviewsAllowExactlyOneDecision() throws Exception {
    var request = submitted();
    var start = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(2);
    try {
      Callable<Boolean> approve =
          () -> {
            login("reviewer", "ROLE_APPROVER");
            start.await();
            try {
              retirement.review(request.id(), request.version(), true, "Concurrent decision");
              return true;
            } catch (RuntimeException ex) {
              return false;
            } finally {
              SecurityContextHolder.clearContext();
            }
          };
      var a = pool.submit(approve);
      var b = pool.submit(approve);
      start.countDown();
      assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from audit_event where action='REQUEST_APPROVED' and"
                      + " entity_id=?",
                  Long.class,
                  request.id()))
          .isEqualTo(1);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void authenticationCsrfRolesAndValidation() throws Exception {
    mvc.perform(get("/api/v1/members")).andExpect(status().isUnauthorized());
    mvc.perform(get("/members")).andExpect(status().is3xxRedirection());
    mvc.perform(
            post("/api/v1/estimates")
                .with(user("staff").roles("STAFF"))
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/v1/estimates")
                .with(user("staff").roles("STAFF"))
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/v1/estimates")
                .with(user("approver").roles("APPROVER"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"memberId\":" + memberId + ",\"asOf\":\"2026-01-01\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/members?size=0").with(user("staff")))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            multipart("/api/v1/imports")
                .file(
                    new MockMultipartFile(
                        "file", "x.csv", "text/csv", csv(number + ",2025-12,5000,500,750\n")))
                .with(user("approver").roles("APPROVER"))
                .with(csrf()))
        .andExpect(status().isForbidden());
  }

  @Test
  void demoPasswordsReallyAuthenticate() throws Exception {
    mvc.perform(formLogin().user("staff").password("Staff-demo-17!"))
        .andExpect(authenticated().withUsername("staff"));
    mvc.perform(formLogin().user("approver").password("Approve-demo-17!"))
        .andExpect(authenticated().withUsername("approver"));
    mvc.perform(formLogin().user("staff").password("wrong")).andExpect(unauthenticated());
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void batchExecutionMetadataIsDurable() {
    var file = postMonth();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from batch_job_execution_params p join batch_job_execution e on"
                    + " e.job_execution_id=p.job_execution_id where p.parameter_name='importId' and"
                    + " p.parameter_value=? and e.status='COMPLETED'",
                Long.class,
                Long.toString(file.id())))
        .isEqualTo(1);
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void databaseFailureRollsBackEarlierRowsAndRecordsFailure() {
    // A test-only constraint makes the second insert fail after the first insert succeeded.
    jdbc.execute(
        "alter table contribution add constraint test_import_failure check (member_id <> "
            + memberId
            + " or pensionable_pay <> 5001)");
    try {
      var file =
          imports.upload(
              "rollback.csv",
              csv(number + ",2025-12,5000,500,750\n" + number + ",2026-01,5001,500,750\n"));
      assertThat(file.status()).isEqualTo("FAILED");
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from contribution where import_id=?", Long.class, file.id()))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from audit_event where action='IMPORT_FAILED' and entity_id=?",
                  Long.class,
                  file.id()))
          .isEqualTo(1);
    } finally {
      jdbc.execute("alter table contribution drop constraint test_import_failure");
    }
  }

  @Test
  void concurrentOverlappingImportsPostOnlyOnce() throws Exception {
    var start = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(2);
    try {
      var first =
          pool.submit(
              () -> {
                login("staff", "ROLE_STAFF");
                start.await();
                try {
                  return postMonth().status();
                } finally {
                  SecurityContextHolder.clearContext();
                }
              });
      var second =
          pool.submit(
              () -> {
                login("staff", "ROLE_STAFF");
                start.await();
                try {
                  return imports
                      .upload("overlap.csv", csv(number + ",2025-12,5000.00,500.00,750.00\n"))
                      .status();
                } finally {
                  SecurityContextHolder.clearContext();
                }
              });
      start.countDown();
      assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder("POSTED", "REJECTED");
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from contribution where member_id=?", Long.class, memberId))
          .isEqualTo(120);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  @WithMockUser(username = "staff", roles = "STAFF")
  void portalPagesRenderIncludingRecordDetails() throws Exception {
    var file = postMonth();
    var estimate = benefits.create(memberId, LocalDate.of(2026, 1, 1));
    var request = retirement.create(estimate.id());
    for (String path :
        List.of(
            "/",
            "/members",
            "/members/" + memberId,
            "/imports",
            "/imports/" + file.id(),
            "/estimates/" + estimate.id(),
            "/requests",
            "/requests/" + request.id(),
            "/audit")) mvc.perform(get(path)).andExpect(status().isOk());
  }
}
