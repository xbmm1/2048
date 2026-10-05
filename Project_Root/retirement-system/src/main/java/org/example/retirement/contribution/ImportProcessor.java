package org.example.retirement.contribution;

import java.io.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.apache.commons.csv.*;
import org.example.retirement.audit.AuditService;
import org.example.retirement.member.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ImportProcessor {
  public static final List<String> HEADER =
      List.of(
          "member_number",
          "payroll_month",
          "pensionable_pay",
          "employee_contribution",
          "employer_contribution");
  private final JdbcTemplate jdbc;
  private final MemberRepository members;
  private final AuditService audit;
  private final Clock clock;

  public ImportProcessor(
      JdbcTemplate jdbc, MemberRepository members, AuditService audit, Clock clock) {
    this.jdbc = jdbc;
    this.members = members;
    this.audit = audit;
    this.clock = clock;
  }

  record Row(
      int number,
      long memberId,
      String memberNumber,
      LocalDate month,
      BigDecimal pay,
      BigDecimal employee,
      BigDecimal employer) {}

  @Transactional
  public void process(long id) throws IOException {
    var file = jdbc.queryForMap("select * from import_file where id=? for update", id);
    if (!file.get("status").equals("RECEIVED")) return;
    String actor = (String) file.get("submitted_by");
    List<Row> valid = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    boolean invalid = false;
    int count = 0;
    try (var csv =
        CSVFormat.DEFAULT
            .builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreEmptyLines(false)
            .get()
            .parse(new StringReader((String) file.get("content")))) {
      if (!csv.getHeaderNames().equals(HEADER)) {
        error(id, 1, "", "", "Expected header: " + String.join(",", HEADER));
        invalid = true;
      } else {
        // Bound memory and transaction duration for a synchronous teaching example.
        for (var record : csv) {
          count++;
          int line = (int) record.getRecordNumber() + 1;
          if (count > 5000) {
            error(id, line, "", "", "Maximum 5000 records per import.");
            invalid = true;
            break;
          }
          String number = record.size() > 0 ? record.get(0).trim() : "";
          String monthText = record.size() > 1 ? record.get(1).trim() : "";
          try {
            if (record.size() != 5)
              throw new IllegalArgumentException("Expected exactly five columns.");
            var memberRows =
                jdbc.queryForList(
                    "select id from member where member_number=?", Long.class, number);
            if (memberRows.isEmpty()) throw new IllegalArgumentException("Unknown member number.");
            long memberId = memberRows.get(0);
            LocalDate month = YearMonth.parse(monthText).atDay(1);
            if (month.isAfter(LocalDate.now(clock).withDayOfMonth(1)))
              throw new IllegalArgumentException("Future payroll month.");
            if (!seen.add(number + "/" + month))
              throw new IllegalArgumentException("Duplicate member/month in file.");
            valid.add(
                new Row(
                    line,
                    memberId,
                    number,
                    month,
                    money(record.get(2), true),
                    money(record.get(3), false),
                    money(record.get(4), false)));
          } catch (RuntimeException ex) {
            error(
                id,
                line,
                number,
                monthText,
                ex instanceof IllegalArgumentException
                    ? ex.getMessage()
                    : "Invalid date or amount.");
            invalid = true;
          }
        }
      }
    } catch (UncheckedIOException | IllegalArgumentException ex) {
      error(id, count + 2, "", "", "Malformed CSV: check quoting and column values.");
      invalid = true;
    }
    if (count == 0) {
      error(id, 0, "", "", "File contains no contribution rows.");
      invalid = true;
    }
    // Acquire member locks in a fixed order. Imports, estimates, and approval share these locks.
    Map<Long, Member> locked = new HashMap<>();
    valid.stream()
        .map(Row::memberId)
        .distinct()
        .sorted()
        .forEach(memberId -> locked.put(memberId, members.lockById(memberId).orElseThrow()));
    for (var row : valid) {
      var member = locked.get(row.memberId());
      String message = null;
      if (!member.getStatus().equals("ACTIVE")) message = "Member is retired.";
      else if (row.month().isBefore(member.getEmploymentStart().withDayOfMonth(1)))
        message = "Payroll month precedes employment.";
      else if (jdbc.queryForObject(
              "select count(*) from contribution where member_id=? and payroll_month=?",
              Long.class,
              row.memberId(),
              row.month())
          > 0) message = "Member/month already posted.";
      if (message != null) {
        error(id, row.number(), row.memberNumber(), row.month().toString(), message);
        invalid = true;
      } else
        jdbc.update(
            "insert into import_row(import_id,row_number,member_number,payroll_month) values"
                + " (?,?,?,?)",
            id,
            row.number(),
            row.memberNumber(),
            row.month().toString());
    }
    if (!invalid)
      for (var row : valid)
        jdbc.update(
            "insert into"
                + " contribution(member_id,payroll_month,pensionable_pay,employee_amount,employer_amount,import_id)"
                + " values (?,?,?,?,?,?)",
            row.memberId(),
            row.month(),
            row.pay(),
            row.employee(),
            row.employer(),
            id);
    String status = invalid ? "REJECTED" : "POSTED";
    jdbc.update("update import_file set status=?,row_count=? where id=?", status, count, id);
    audit.record(
        actor,
        "IMPORT_" + status,
        "import",
        id,
        count + " data rows; " + (invalid ? "nothing posted" : "all rows posted"));
  }

  private BigDecimal money(String value, boolean positive) {
    if (!value.trim().matches("[0-9]{1,12}(\\.[0-9]{1,2})?"))
      throw new IllegalArgumentException(
          "Amounts require nonnegative decimal currency, up to two decimal places.");
    BigDecimal amount = new BigDecimal(value.trim());
    if (positive && amount.signum() == 0)
      throw new IllegalArgumentException("Pensionable pay must be positive.");
    return amount;
  }

  private void error(long id, int line, String member, String month, String message) {
    jdbc.update(
        "insert into import_row(import_id,row_number,member_number,payroll_month,error) values"
            + " (?,?,?,?,?) on conflict(import_id,row_number) do update set error=excluded.error",
        id,
        line,
        member.substring(0, Math.min(100, member.length())),
        month.substring(0, Math.min(100, month.length())),
        message);
  }
}
