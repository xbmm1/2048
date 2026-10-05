package org.example.retirement.common;

import java.util.List;

public record PageResult<T>(List<T> items, int page, int size, long total) {
  public static void validate(int page, int size) {
    if (page < 0 || page > 100000 || size < 1 || size > 100)
      throw DomainException.invalid("Page must be 0–100000 and size 1–100.");
  }
}
