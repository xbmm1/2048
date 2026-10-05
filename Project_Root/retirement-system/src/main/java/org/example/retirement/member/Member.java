package org.example.retirement.member;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "member")
public class Member {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  private Long employerId;
  private String memberNumber;
  private String name;
  private LocalDate birthDate;
  private LocalDate employmentStart;
  private String status;
  @Version private long version;

  protected Member() {}

  public Long getId() {
    return id;
  }

  public Long getEmployerId() {
    return employerId;
  }

  public String getMemberNumber() {
    return memberNumber;
  }

  public String getName() {
    return name;
  }

  public LocalDate getBirthDate() {
    return birthDate;
  }

  public LocalDate getEmploymentStart() {
    return employmentStart;
  }

  public String getStatus() {
    return status;
  }

  public long getVersion() {
    return version;
  }

  public void retire() {
    status = "RETIRED";
  }
}
