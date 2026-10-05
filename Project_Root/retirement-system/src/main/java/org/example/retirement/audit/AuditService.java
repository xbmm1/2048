package org.example.retirement.audit;

import java.time.OffsetDateTime;
import org.example.retirement.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AuditService {
  private final JdbcTemplate jdbc;

  public AuditService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void record(String actor, String action, String type, long id, String detail) {
    jdbc.update(
        "insert into audit_event(actor,action,entity_type,entity_id,detail) values (?,?,?,?,?)",
        actor,
        action,
        type,
        id,
        detail);
  }

  public record Event(
      long id,
      String actor,
      String action,
      String entityType,
      long entityId,
      String detail,
      OffsetDateTime createdAt) {}

  @PreAuthorize("isAuthenticated()")
  @Transactional(readOnly = true)
  public PageResult<Event> list(int page, int size) {
    PageResult.validate(page, size);
    var rows =
        jdbc.query(
            "select * from audit_event order by id desc limit ? offset ?",
            (rs, n) ->
                new Event(
                    rs.getLong("id"),
                    rs.getString("actor"),
                    rs.getString("action"),
                    rs.getString("entity_type"),
                    rs.getLong("entity_id"),
                    rs.getString("detail"),
                    rs.getObject("created_at", OffsetDateTime.class)),
            size,
            page * size);
    return new PageResult<>(
        rows, page, size, jdbc.queryForObject("select count(*) from audit_event", Long.class));
  }
}
