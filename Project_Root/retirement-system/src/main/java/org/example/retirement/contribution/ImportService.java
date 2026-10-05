package org.example.retirement.contribution;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.example.retirement.audit.AuditService;
import org.example.retirement.common.*;
import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.parameters.JobParametersBuilder;
import org.springframework.batch.core.launch.JobOperator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ImportService {
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(ImportService.class);
  private final JdbcTemplate jdbc;
  private final AuditService audit;
  private final JobOperator operator;
  private final Job job;
  private final TransactionTemplate tx;

  public ImportService(
      JdbcTemplate jdbc,
      AuditService audit,
      JobOperator operator,
      Job contributionImportJob,
      PlatformTransactionManager transactions) {
    this.jdbc = jdbc;
    this.audit = audit;
    this.operator = operator;
    this.job = contributionImportJob;
    this.tx = new TransactionTemplate(transactions);
  }

  public record ImportView(
      long id,
      String filename,
      String status,
      int rowCount,
      String submittedBy,
      OffsetDateTime createdAt) {}

  public record RowView(int rowNumber, String memberNumber, String payrollMonth, String error) {}

  @PreAuthorize("hasRole('STAFF')")
  public ImportView upload(String filename, byte[] bytes) {
    if (bytes.length == 0 || bytes.length > 1048576)
      throw DomainException.invalid("Upload a CSV between 1 byte and 1 MB.");
    String text = new String(bytes, StandardCharsets.UTF_8).replace("\uFEFF", "");
    if (text.indexOf('\0') >= 0 || text.indexOf('\uFFFD') >= 0)
      throw DomainException.invalid("CSV must be UTF-8 text.");
    String hash;
    try {
      hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException(ex);
    }
    var existing =
        jdbc.queryForList("select id from import_file where fingerprint=?", Long.class, hash);
    if (!existing.isEmpty()) return get(existing.get(0));
    String safeName = filename == null ? "upload.csv" : filename.replaceAll("[^a-zA-Z0-9._-]", "_");
    safeName = safeName.substring(0, Math.min(200, safeName.length()));
    String finalName = safeName;
    Long id =
        tx.execute(
            status -> {
              var inserted =
                  jdbc.queryForList(
                      "insert into import_file(fingerprint,filename,content,submitted_by) values"
                          + " (?,?,?,?) on conflict(fingerprint) do nothing returning id",
                      Long.class,
                      hash,
                      finalName,
                      text,
                      Actor.name());
              if (inserted.isEmpty()) return null;
              long value = inserted.get(0);
              audit.record(Actor.name(), "IMPORT_RECEIVED", "import", value, finalName);
              return value;
            });
    if (id == null)
      return get(
          jdbc.queryForObject("select id from import_file where fingerprint=?", Long.class, hash));
    try {
      var execution =
          operator.start(job, new JobParametersBuilder().addLong("importId", id).toJobParameters());
      if (execution.getStatus().isUnsuccessful()) markFailed(id);
    } catch (Exception ex) {
      log.error("Batch launch failed for import {}", id, ex);
      markFailed(id);
    }
    return get(id);
  }

  private void markFailed(long id) {
    tx.executeWithoutResult(
        status -> {
          if (jdbc.update(
                  "update import_file set status='FAILED' where id=? and status='RECEIVED'", id)
              == 1)
            audit.record(
                Actor.name(),
                "IMPORT_FAILED",
                "import",
                id,
                "Processing failed; no partial contributions were posted. Inspect server batch"
                    + " logs.");
        });
  }

  @PreAuthorize("isAuthenticated()")
  public ImportView get(long id) {
    return jdbc
        .query(
            "select id,filename,status,row_count,submitted_by,created_at from import_file where"
                + " id=?",
            (rs, n) ->
                new ImportView(
                    rs.getLong(1),
                    rs.getString(2),
                    rs.getString(3),
                    rs.getInt(4),
                    rs.getString(5),
                    rs.getObject(6, OffsetDateTime.class)),
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> DomainException.missing("Import not found."));
  }

  @PreAuthorize("isAuthenticated()")
  public PageResult<ImportView> list(int page, int size) {
    PageResult.validate(page, size);
    var ids =
        jdbc.queryForList(
            "select id from import_file order by id desc limit ? offset ?",
            Long.class,
            size,
            page * size);
    return new PageResult<>(
        ids.stream().map(this::get).toList(),
        page,
        size,
        jdbc.queryForObject("select count(*) from import_file", Long.class));
  }

  @PreAuthorize("isAuthenticated()")
  public PageResult<RowView> rows(long id, int page, int size) {
    get(id);
    PageResult.validate(page, size);
    var rows =
        jdbc.query(
            "select row_number,member_number,payroll_month,error from import_row where import_id=?"
                + " order by row_number limit ? offset ?",
            (rs, n) -> new RowView(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4)),
            id,
            size,
            page * size);
    return new PageResult<>(
        rows,
        page,
        size,
        jdbc.queryForObject("select count(*) from import_row where import_id=?", Long.class, id));
  }
}
