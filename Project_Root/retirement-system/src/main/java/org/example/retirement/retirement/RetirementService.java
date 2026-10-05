package org.example.retirement.retirement;

import org.example.retirement.audit.AuditService;
import org.example.retirement.benefit.BenefitService;
import org.example.retirement.common.*;
import org.example.retirement.member.MemberRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RetirementService {
  private final JdbcTemplate jdbc;
  private final BenefitService benefits;
  private final MemberRepository members;
  private final AuditService audit;

  public RetirementService(
      JdbcTemplate jdbc, BenefitService benefits, MemberRepository members, AuditService audit) {
    this.jdbc = jdbc;
    this.benefits = benefits;
    this.members = members;
    this.audit = audit;
  }

  public record Request(
      long id,
      long estimateId,
      long memberId,
      String memberName,
      String status,
      String createdBy,
      String reviewedBy,
      String comments,
      long version) {}

  @PreAuthorize("hasRole('STAFF')")
  public Request create(long estimateId) {
    var estimate = benefits.get(estimateId);
    if (!estimate.eligible())
      throw DomainException.invalid("Only an eligible saved estimate can become a request.");
    var member =
        members
            .lockById(estimate.memberId())
            .orElseThrow(() -> DomainException.missing("Member not found."));
    if (!member.getStatus().equals("ACTIVE"))
      throw DomainException.conflict("Member is already retired.");
    Long id =
        jdbc.queryForObject(
            "insert into retirement_request(estimate_id,member_id,created_by) values (?,?,?)"
                + " returning id",
            Long.class,
            estimateId,
            estimate.memberId(),
            Actor.name());
    audit.record(Actor.name(), "REQUEST_CREATED", "request", id, "Saved estimate " + estimateId);
    return get(id);
  }

  @PreAuthorize("hasRole('STAFF')")
  public Request submit(long id, long version) {
    var request = get(id);
    if (!request.createdBy().equals(Actor.name()))
      throw DomainException.conflict("Only the creator can submit a request.");
    transition(request, version, "DRAFT", "SUBMITTED", null, null);
    return get(id);
  }

  @PreAuthorize("hasRole('APPROVER')")
  public Request review(long id, long version, boolean approve, String comments) {
    var request = get(id);
    if (request.createdBy().equals(Actor.name()))
      throw DomainException.conflict("A creator cannot approve or reject their own request.");
    if (comments == null || comments.isBlank() || comments.length() > 1000)
      throw DomainException.invalid("Review comments must contain 1–1000 characters.");
    var member =
        members
            .lockById(request.memberId())
            .orElseThrow(() -> DomainException.missing("Member not found."));
    if (!member.getStatus().equals("ACTIVE"))
      throw DomainException.conflict("Member is already retired.");
    transition(
        request, version, "SUBMITTED", approve ? "APPROVED" : "REJECTED", Actor.name(), comments);
    if (approve) member.retire();
    return get(id);
  }

  private void transition(
      Request request, long version, String from, String to, String reviewer, String comments) {
    if (jdbc.update(
            "update retirement_request set status=?,version=version+1,reviewed_by=?,comments=?"
                + " where id=? and status=? and version=?",
            to,
            reviewer,
            comments,
            request.id(),
            from,
            version)
        != 1)
      throw DomainException.conflict(
          "Request changed or transition is not allowed. Refresh and try again.");
    audit.record(Actor.name(), "REQUEST_" + to, "request", request.id(), from + " -> " + to);
  }

  @PreAuthorize("isAuthenticated()")
  @Transactional(readOnly = true)
  public Request get(long id) {
    return jdbc
        .query(
            "select r.*,m.name from retirement_request r join member m on m.id=r.member_id where"
                + " r.id=?",
            (rs, n) ->
                new Request(
                    rs.getLong("id"),
                    rs.getLong("estimate_id"),
                    rs.getLong("member_id"),
                    rs.getString("name"),
                    rs.getString("status"),
                    rs.getString("created_by"),
                    rs.getString("reviewed_by"),
                    rs.getString("comments"),
                    rs.getLong("version")),
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> DomainException.missing("Request not found."));
  }

  @PreAuthorize("isAuthenticated()")
  @Transactional(readOnly = true)
  public PageResult<Request> list(String status, int page, int size) {
    PageResult.validate(page, size);
    var ids =
        jdbc.queryForList(
            "select id from retirement_request where (?='' or status=?) order by id desc limit ?"
                + " offset ?",
            Long.class,
            status,
            status,
            size,
            page * size);
    return new PageResult<>(
        ids.stream().map(this::get).toList(),
        page,
        size,
        jdbc.queryForObject(
            "select count(*) from retirement_request where (?='' or status=?)",
            Long.class,
            status,
            status));
  }
}
