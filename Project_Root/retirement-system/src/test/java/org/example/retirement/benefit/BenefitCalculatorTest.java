package org.example.retirement.benefit;

import static org.assertj.core.api.Assertions.*;

import java.math.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class BenefitCalculatorTest {
  private final BenefitCalculator calculator = new BenefitCalculator();
  private final LocalDate asOf = LocalDate.of(2026, 1, 1);

  private List<BenefitCalculator.PayMonth> months(int count, String pay) {
    List<BenefitCalculator.PayMonth> rows = new ArrayList<>();
    for (int i = 0; i < count; i++)
      rows.add(new BenefitCalculator.PayMonth(asOf.minusMonths(i), new BigDecimal(pay)));
    return rows;
  }

  @Test
  void eligibleOnFiftyFifthBirthdayWithTenYears() {
    var result = calculator.calculate(asOf.minusYears(55), asOf, months(120, "5000"));
    assertThat(result.eligible()).isTrue();
    assertThat(result.annualPension()).isEqualByComparingTo("12000.00");
    assertThat(result.monthlyPension()).isEqualByComparingTo("1000.00");
  }

  @Test
  void dayBeforeBirthdayIsIneligible() {
    assertThat(
            calculator
                .calculate(asOf.minusYears(55).plusDays(1), asOf, months(120, "5000"))
                .eligible())
        .isFalse();
  }

  @Test
  void missingServiceMonthIsIneligible() {
    var rows = months(121, "5000");
    rows.remove(10);
    rows.remove(20);
    var result = calculator.calculate(asOf.minusYears(60), asOf, rows);
    assertThat(result.serviceMonths()).isEqualTo(119);
    assertThat(result.eligible()).isFalse();
  }

  @Test
  void requiresThirtySixMonthsAndExcludesFutureMonths() {
    var rows = months(35, "5000");
    rows.add(new BenefitCalculator.PayMonth(asOf.plusMonths(1), new BigDecimal("99999")));
    var result = calculator.calculate(asOf.minusYears(60), asOf, rows);
    assertThat(result.serviceMonths()).isEqualTo(35);
    assertThat(result.averageAnnualPay()).isZero();
    assertThat(result.eligible()).isFalse();
  }

  @Test
  void averagesOnlyLatestThirtySixPostedMonths() {
    var rows = months(120, "1000");
    for (int i = 0; i < 36; i++)
      rows.set(i, new BenefitCalculator.PayMonth(asOf.minusMonths(i), new BigDecimal("5000")));
    assertThat(calculator.calculate(asOf.minusYears(60), asOf, rows).averageAnnualPay())
        .isEqualByComparingTo("60000");
  }

  @Test
  void pensionIsCappedAtSeventyFivePercent() {
    assertThat(calculator.calculate(asOf.minusYears(70), asOf, months(480, "5000")).annualPension())
        .isEqualByComparingTo("45000");
  }

  @Test
  void roundsFinalCurrencyHalfUpWithoutRoundingServiceYears() {
    var result = calculator.calculate(asOf.minusYears(60), asOf, months(121, "5000.01"));
    assertThat(result.annualPension()).isEqualByComparingTo("12100.02");
    assertThat(result.monthlyPension()).isEqualByComparingTo("1008.34");
  }

  @Test
  void duplicateMonthsAreRejectedRatherThanDoubleCredited() {
    var rows = months(120, "5000");
    rows.add(rows.get(0));
    assertThatThrownBy(() -> calculator.calculate(asOf.minusYears(60), asOf, rows))
        .hasMessageContaining("Duplicate");
  }
}
