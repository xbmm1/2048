package org.example.retirement.common;

import org.springframework.security.core.context.SecurityContextHolder;

public final class Actor {
  private Actor() {}

  public static String name() {
    return SecurityContextHolder.getContext().getAuthentication().getName();
  }
}
