package org.example.retirement.benefit;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.example.retirement.audit.AuditService;
import org.example.retirement.common.*;
import org.example.retirement.member.MemberRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
@Transactional
public class BenefitService {
  private final JdbcTemplate jdbc;
  private final MemberRepository members;
  private final AuditService audit;
  private final Clock clock;
  private final ObjectMapper json;

  public BenefitService(
      JdbcTemplate jdbc,
      MemberRepository members,
      AuditService audit,
      Clock clock,
      ObjectMapper json) {
    this.jdbc = jdbc;
    this.members = members;
    this.audit = audit;
    this.clock = clock;
    this.json = json;
  }

  public record Estimate(
      long id,
      long memberId,
      LocalDate asOf,
      int age,
      int serviceMonths,
      BigDecimal averageAnnualPay,
      BigDecimal annualPension,
      BigDecimal monthlyPension,
      boolean eligible,
      String reason,
      String ruleVersion,
      String createdBy) {}

  @PreAuthorize("hasRole('STAFF')")
  public Estimate create(long memberId, LocalDate asOf) {
    if (asOf.isAfter(LocalDate.now(clock)))
      throw DomainException.invalid(
          "Future projections are outside this example. Choose today or earlier.");
    var member =
        members.lockById(memberId).orElseThrow(() -> DomainException.missing("Member not found."));
    if (!member.getStatus().equals("ACTIVE"))
      throw DomainException.conflict("Member is already retired.");
    if (asOf.isBefore(member.getEmploymentStart()))
      throw DomainException.invalid("Estimate date precedes employment.");
    var months =
        jdbc.query(
            "select payroll_month,pensionable_pay from contribution where member_id=? and"
                + " payroll_month<=? order by payroll_month desc",
            (rs, n) ->
                new BenefitCalculator.PayMonth(rs.getDate(1).toLocalDate(), rs.getBigDecimal(2)),
            memberId,
            asOf);
    var result = new BenefitCalculator().calculate(member.getBirthDate(), asOf, months);
    String snapshot =
        json.writeValueAsString(
            Map.of(
                "birthDate",
                member.getBirthDate(),
                "employmentStart",
                member.getEmploymentStart(),
                "asOf",
                asOf,
                "months",
                months));
    Long id =
        jdbc.queryForObject(
            """
insert into benefit_estimate(member_id,as_of,age,service_months,average_annual_pay,annual_pension,monthly_pension,eligible,reason,rule_version,inputs_json,created_by)
values (?,?,?,?,?,?,?,?,?,?,?,?) returning id
""",
            Long.class,
            memberId,
            asOf,
            result.age(),
            result.serviceMonths(),
            result.averageAnnualPay(),
            result.annualPension(),
            result.monthlyPension(),
            result.eligible(),
            result.reason(),
            BenefitCalculator.RULE_VERSION,
            snapshot,
            Actor.name());
    audit.record(
        Actor.name(),
        "ESTIMATE_SAVED",
        "estimate",
        id,
        "Rule " + BenefitCalculator.RULE_VERSION + "; service months " + result.serviceMonths());
    return get(id);
  }

  @PreAuthorize("isAuthenticated()")
  @Transactional(readOnly = true)
  public Estimate get(long id) {
    return jdbc
        .query(
            "select * from benefit_estimate where id=?",
            (rs, n) ->
                new Estimate(
                    rs.getLong("id"),
                    rs.getLong("member_id"),
                    rs.getDate("as_of").toLocalDate(),
                    rs.getInt("age"),
                    rs.getInt("service_months"),
                    rs.getBigDecimal("average_annual_pay"),
                    rs.getBigDecimal("annual_pension"),
                    rs.getBigDecimal("monthly_pension"),
                    rs.getBoolean("eligible"),
                    rs.getString("reason"),
                    rs.getString("rule_version"),
                    rs.getString("created_by")),
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> DomainException.missing("Estimate not found."));
  }

  @PreAuthorize("isAuthenticated()")
  @Transactional(readOnly = true)
  public PageResult<Estimate> list(long memberId, int page, int size) {
    PageResult.validate(page, size);
    var ids =
        jdbc.queryForList(
            "select id from benefit_estimate where member_id=? order by id desc limit ? offset ?",
            Long.class,
            memberId,
            size,
            page * size);
    return new PageResult<>(
        ids.stream().map(this::get).toList(),
        page,
        size,
        jdbc.queryForObject(
            "select count(*) from benefit_estimate where member_id=?", Long.class, memberId));
  }
}
