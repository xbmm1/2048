package org.example.retirement.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.time.LocalDate;
import java.util.Map;
import org.example.retirement.audit.AuditService;
import org.example.retirement.benefit.BenefitService;
import org.example.retirement.common.PageResult;
import org.example.retirement.contribution.ImportService;
import org.example.retirement.member.MemberService;
import org.example.retirement.reporting.ReportService;
import org.example.retirement.retirement.RetirementService;
import org.springframework.http.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class ApiController {
  private final MemberService members;
  private final ImportService imports;
  private final BenefitService benefits;
  private final RetirementService retirement;
  private final ReportService reports;
  private final AuditService audit;

  public ApiController(
      MemberService members,
      ImportService imports,
      BenefitService benefits,
      RetirementService retirement,
      ReportService reports,
      AuditService audit) {
    this.members = members;
    this.imports = imports;
    this.benefits = benefits;
    this.retirement = retirement;
    this.reports = reports;
    this.audit = audit;
  }

  public record EstimateInput(@Positive long memberId, @NotNull LocalDate asOf) {}

  public record RequestInput(@Positive long estimateId) {}

  public record VersionInput(@PositiveOrZero long version) {}

  public record ReviewInput(
      @PositiveOrZero long version,
      @NotNull Boolean approve,
      @NotBlank @Size(max = 1000) String comments) {}

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of(
        "token",
        token.getToken(),
        "headerName",
        token.getHeaderName(),
        "parameterName",
        token.getParameterName());
  }

  @GetMapping("/members")
  public PageResult<MemberService.MemberView> members(
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return members.list(q, page, size);
  }

  @GetMapping("/members/{id}")
  public MemberService.MemberView member(@PathVariable long id) {
    return members.get(id);
  }

  @GetMapping("/imports")
  public PageResult<ImportService.ImportView> imports(
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
    return imports.list(page, size);
  }

  @PostMapping(value = "/imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ImportService.ImportView upload(@RequestParam MultipartFile file) throws IOException {
    return imports.upload(file.getOriginalFilename(), file.getBytes());
  }

  @GetMapping("/imports/{id}")
  public ImportService.ImportView imported(@PathVariable long id) {
    return imports.get(id);
  }

  @GetMapping("/imports/{id}/rows")
  public PageResult<ImportService.RowView> rows(
      @PathVariable long id,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return imports.rows(id, page, size);
  }

  @PostMapping("/estimates")
  @ResponseStatus(HttpStatus.CREATED)
  public BenefitService.Estimate estimate(@Valid @RequestBody EstimateInput input) {
    return benefits.create(input.memberId(), input.asOf());
  }

  @GetMapping("/estimates/{id}")
  public BenefitService.Estimate estimate(@PathVariable long id) {
    return benefits.get(id);
  }

  @GetMapping("/members/{id}/estimates")
  public PageResult<BenefitService.Estimate> estimates(
      @PathVariable long id,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    members.get(id);
    return benefits.list(id, page, size);
  }

  @PostMapping("/requests")
  @ResponseStatus(HttpStatus.CREATED)
  public RetirementService.Request create(@Valid @RequestBody RequestInput input) {
    return retirement.create(input.estimateId());
  }

  @GetMapping("/requests")
  public PageResult<RetirementService.Request> requests(
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return retirement.list(status, page, size);
  }

  @GetMapping("/requests/{id}")
  public RetirementService.Request request(@PathVariable long id) {
    return retirement.get(id);
  }

  @PostMapping("/requests/{id}/submit")
  public RetirementService.Request submit(
      @PathVariable long id, @Valid @RequestBody VersionInput input) {
    return retirement.submit(id, input.version());
  }

  @PostMapping("/requests/{id}/review")
  public RetirementService.Request review(
      @PathVariable long id, @Valid @RequestBody ReviewInput input) {
    return retirement.review(id, input.version(), input.approve(), input.comments());
  }

  @GetMapping("/audit")
  public PageResult<AuditService.Event> audit(
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
    return audit.list(page, size);
  }

  @GetMapping("/reports/estimates/{id}.pdf")
  public ResponseEntity<byte[]> report(@PathVariable long id) {
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .header("Content-Disposition", "inline; filename=estimate-" + id + ".pdf")
        .header("Cache-Control", "no-store")
        .body(reports.summary(id));
  }
}
