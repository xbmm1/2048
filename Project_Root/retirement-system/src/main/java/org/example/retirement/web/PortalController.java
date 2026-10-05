package org.example.retirement.web;

import java.io.IOException;
import java.time.*;
import org.example.retirement.audit.AuditService;
import org.example.retirement.benefit.BenefitService;
import org.example.retirement.contribution.ImportService;
import org.example.retirement.member.MemberService;
import org.example.retirement.retirement.RetirementService;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@Controller
public class PortalController {
  private final MemberService members;
  private final ImportService imports;
  private final BenefitService benefits;
  private final RetirementService retirement;
  private final AuditService audit;
  private final Clock clock;

  public PortalController(
      MemberService members,
      ImportService imports,
      BenefitService benefits,
      RetirementService retirement,
      AuditService audit,
      Clock clock) {
    this.members = members;
    this.imports = imports;
    this.benefits = benefits;
    this.retirement = retirement;
    this.audit = audit;
    this.clock = clock;
  }

  @ModelAttribute
  public void identity(Model model, Authentication auth) {
    if (auth != null) {
      model.addAttribute("username", auth.getName());
      model.addAttribute(
          "staff",
          auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_STAFF")));
      model.addAttribute(
          "approver",
          auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_APPROVER")));
    }
    model.addAttribute("today", LocalDate.now(clock));
  }

  @GetMapping("/")
  public String home(Model model) {
    model.addAttribute("memberCount", members.list("", 0, 1).total());
    model.addAttribute("pendingCount", retirement.list("SUBMITTED", 0, 1).total());
    model.addAttribute("importCount", imports.list(0, 1).total());
    model.addAttribute("events", audit.list(0, 5).items());
    return "dashboard";
  }

  @GetMapping("/members")
  public String members(
      Model model,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "0") int page) {
    model.addAttribute("q", q);
    model.addAttribute("data", members.list(q, page, 20));
    return "members";
  }

  @GetMapping("/members/{id}")
  public String member(
      Model model, @PathVariable long id, @RequestParam(defaultValue = "0") int page) {
    model.addAttribute("member", members.get(id));
    model.addAttribute("data", benefits.list(id, page, 20));
    return "member";
  }

  @PostMapping("/members/{id}/estimates")
  public String estimate(@PathVariable long id, @RequestParam LocalDate asOf) {
    return "redirect:/estimates/" + benefits.create(id, asOf).id();
  }

  @GetMapping("/estimates/{id}")
  public String estimate(Model model, @PathVariable long id) {
    var estimate = benefits.get(id);
    model.addAttribute("estimate", estimate);
    model.addAttribute("member", members.get(estimate.memberId()));
    return "estimate";
  }

  @GetMapping("/imports")
  public String imports(Model model, @RequestParam(defaultValue = "0") int page) {
    model.addAttribute("data", imports.list(page, 20));
    return "imports";
  }

  @PostMapping("/imports")
  public String upload(@RequestParam MultipartFile file) throws IOException {
    return "redirect:/imports/" + imports.upload(file.getOriginalFilename(), file.getBytes()).id();
  }

  @GetMapping("/imports/{id}")
  public String imported(
      Model model, @PathVariable long id, @RequestParam(defaultValue = "0") int page) {
    model.addAttribute("import", imports.get(id));
    model.addAttribute("data", imports.rows(id, page, 50));
    return "import";
  }

  @GetMapping("/requests")
  public String requests(
      Model model,
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "0") int page) {
    model.addAttribute("status", status);
    model.addAttribute("data", retirement.list(status, page, 20));
    return "requests";
  }

  @PostMapping("/requests")
  public String create(@RequestParam long estimateId) {
    return "redirect:/requests/" + retirement.create(estimateId).id();
  }

  @GetMapping("/requests/{id}")
  public String request(Model model, @PathVariable long id) {
    model.addAttribute("request", retirement.get(id));
    return "request";
  }

  @PostMapping("/requests/{id}/submit")
  public String submit(@PathVariable long id, @RequestParam long version) {
    retirement.submit(id, version);
    return "redirect:/requests/" + id;
  }

  @PostMapping("/requests/{id}/review")
  public String review(
      @PathVariable long id,
      @RequestParam long version,
      @RequestParam boolean approve,
      @RequestParam String comments) {
    retirement.review(id, version, approve, comments);
    return "redirect:/requests/" + id;
  }

  @GetMapping("/audit")
  public String audit(Model model, @RequestParam(defaultValue = "0") int page) {
    model.addAttribute("data", audit.list(page, 20));
    return "audit";
  }
}
