package org.example.retirement.benefit;

import java.math.*;
import java.time.*;
import java.util.*;
import org.example.retirement.common.DomainException;

/** Pure, deterministic fictional rules. No database, HTTP, or Spring dependencies. */
public class BenefitCalculator {
  public static final String RULE_VERSION = "LEARNING-1.0";
  private static final MathContext MC = MathContext.DECIMAL128;

  public record PayMonth(LocalDate month, BigDecimal pay) {}

  public record Result(
      int age,
      int serviceMonths,
      BigDecimal averageAnnualPay,
      BigDecimal annualPension,
      BigDecimal monthlyPension,
      boolean eligible,
      String reason) {}

  public Result calculate(LocalDate birthDate, LocalDate asOf, List<PayMonth> contributions) {
    if (asOf.isBefore(birthDate))
      throw DomainException.invalid("Estimate date precedes birth date.");
    var months =
        contributions.stream()
            .filter(p -> !p.month().isAfter(asOf.withDayOfMonth(1)))
            .sorted(Comparator.comparing(PayMonth::month).reversed())
            .toList();
    if (months.stream().map(PayMonth::month).distinct().count() != months.size())
      throw DomainException.invalid("Duplicate service month.");
    int age = Period.between(birthDate, asOf).getYears();
    if (months.size() < 36)
      return new Result(
          age,
          months.size(),
          BigDecimal.ZERO,
          BigDecimal.ZERO,
          BigDecimal.ZERO,
          false,
          "At least 36 posted months are required.");
    BigDecimal average =
        months.stream()
            .limit(36)
            .map(PayMonth::pay)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .divide(new BigDecimal("3"), MC);
    BigDecimal factor =
        new BigDecimal(months.size())
            .divide(new BigDecimal("12"), MC)
            .multiply(new BigDecimal("0.02"))
            .min(new BigDecimal("0.75"));
    BigDecimal unrounded = average.multiply(factor, MC);
    boolean eligible = age >= 55 && months.size() >= 120;
    return new Result(
        age,
        months.size(),
        average.setScale(8, RoundingMode.HALF_UP),
        unrounded.setScale(2, RoundingMode.HALF_UP),
        unrounded.divide(new BigDecimal("12"), MC).setScale(2, RoundingMode.HALF_UP),
        eligible,
        eligible
            ? "Eligible under fictional learning rules."
            : "Requires age 55 and 120 posted service months.");
  }
}
