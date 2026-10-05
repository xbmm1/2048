package org.example.retirement.member;

import java.time.LocalDate;
import org.example.retirement.common.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@PreAuthorize("isAuthenticated()")
public class MemberService {
  private final MemberRepository members;
  private final JdbcTemplate jdbc;

  public MemberService(MemberRepository members, JdbcTemplate jdbc) {
    this.members = members;
    this.jdbc = jdbc;
  }

  public record MemberView(
      long id,
      String memberNumber,
      String name,
      String employer,
      LocalDate birthDate,
      LocalDate employmentStart,
      String status,
      long version) {}

  private MemberView view(Member m) {
    return new MemberView(
        m.getId(),
        m.getMemberNumber(),
        m.getName(),
        jdbc.queryForObject(
            "select name from employer where id=?", String.class, m.getEmployerId()),
        m.getBirthDate(),
        m.getEmploymentStart(),
        m.getStatus(),
        m.getVersion());
  }

  public PageResult<MemberView> list(String q, int page, int size) {
    PageResult.validate(page, size);
    var result =
        members.findByNameContainingIgnoreCaseOrMemberNumberContainingIgnoreCase(
            q, q, PageRequest.of(page, size, Sort.by("memberNumber")));
    return new PageResult<>(
        result.stream().map(this::view).toList(), page, size, result.getTotalElements());
  }

  public MemberView get(long id) {
    return view(
        members.findById(id).orElseThrow(() -> DomainException.missing("Member not found.")));
  }
}
