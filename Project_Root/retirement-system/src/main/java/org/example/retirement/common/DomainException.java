package org.example.retirement.common;

import org.springframework.http.HttpStatus;

public class DomainException extends RuntimeException {
  public final HttpStatus status;

  public DomainException(HttpStatus status, String message) {
    super(message);
    this.status = status;
  }

  public static DomainException invalid(String message) {
    return new DomainException(HttpStatus.UNPROCESSABLE_ENTITY, message);
  }

  public static DomainException conflict(String message) {
    return new DomainException(HttpStatus.CONFLICT, message);
  }

  public static DomainException missing(String message) {
    return new DomainException(HttpStatus.NOT_FOUND, message);
  }
}
