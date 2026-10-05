package org.example.retirement.member;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;

public interface MemberRepository extends JpaRepository<Member, Long> {
  Page<Member> findByNameContainingIgnoreCaseOrMemberNumberContainingIgnoreCase(
      String name, String number, Pageable page);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select m from Member m where m.id = :id")
  Optional<Member> lockById(long id);
}
