package org.example.retirement.reporting;

import java.util.*;
import net.sf.jasperreports.engine.*;
import org.example.retirement.benefit.BenefitService;
import org.example.retirement.member.MemberService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportService {
  private final JdbcTemplate jdbc;
  private final BenefitService benefits;
  private final MemberService members;
  private volatile JasperReport compiled;

  public ReportService(JdbcTemplate jdbc, BenefitService benefits, MemberService members) {
    this.jdbc = jdbc;
    this.benefits = benefits;
    this.members = members;
  }

  @PreAuthorize("isAuthenticated()")
  @Transactional(readOnly = true)
  public byte[] summary(long estimateId) {
    var estimate = benefits.get(estimateId);
    var member = members.get(estimate.memberId());
    var totals =
        jdbc.queryForMap("select * from member_contribution_summary(?)", estimate.memberId());
    Map<String, Object> parameters = new HashMap<>();
    parameters.put("MEMBER", member.name() + " | " + member.memberNumber());
    parameters.put("EMPLOYER", member.employer());
    parameters.put(
        "ESTIMATE",
        "Saved estimate #"
            + estimate.id()
            + " | As of "
            + estimate.asOf()
            + " | "
            + estimate.ruleVersion());
    parameters.put("ELIGIBILITY", estimate.reason());
    parameters.put(
        "BENEFIT",
        String.format(
            Locale.US,
            "Annual pension: $%,.2f     Monthly pension: $%,.2f",
            estimate.annualPension(),
            estimate.monthlyPension()));
    parameters.put(
        "INPUTS",
        String.format(
            Locale.US,
            "Age: %d     Service months: %d     Average annual pay: $%,.2f",
            estimate.age(),
            estimate.serviceMonths(),
            estimate.averageAnnualPay()));
    parameters.put(
        "TOTALS",
        String.format(
            Locale.US,
            "Posted months: %s\n"
                + "Pensionable pay: $%,.2f\n"
                + "Employee contributions: $%,.2f\n"
                + "Employer contributions: $%,.2f",
            totals.get("months"),
            totals.get("pensionable_total"),
            totals.get("employee_total"),
            totals.get("employer_total")));
    return render(parameters);
  }

  public byte[] render(Map<String, Object> parameters) {
    try {
      if (compiled == null)
        synchronized (this) {
          if (compiled == null)
            try (var source = getClass().getResourceAsStream("/reports/member-summary.jrxml")) {
              compiled = JasperCompileManager.compileReport(source);
            }
        }
      return JasperExportManager.exportReportToPdf(
          JasperFillManager.fillReport(
              compiled, new HashMap<>(parameters), new JREmptyDataSource()));
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to render member report.", ex);
    }
  }
}
