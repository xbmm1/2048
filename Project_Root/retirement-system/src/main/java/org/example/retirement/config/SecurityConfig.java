package org.example.retirement.config;

import java.security.SecureRandom;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
  private static final Logger LOG = LoggerFactory.getLogger(SecurityConfig.class);

  @Bean
  BCryptPasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(
            a ->
                a.requestMatchers("/css/**", "/login", "/error")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/**")
                    .authenticated()
                    .anyRequest()
                    .authenticated())
        .formLogin(f -> f.defaultSuccessUrl("/", true))
        .logout(l -> l.logoutSuccessUrl("/login?logout"))
        .exceptionHandling(
            e ->
                e.defaultAuthenticationEntryPointFor(
                        (req, res, ex) -> {
                          res.setStatus(401);
                          res.setContentType("application/problem+json");
                          res.getWriter()
                              .write("{\"title\":\"Authentication required\",\"status\":401}");
                        },
                        req -> req.getRequestURI().startsWith("/api/"))
                    .defaultAuthenticationEntryPointFor(
                        new LoginUrlAuthenticationEntryPoint("/login"),
                        req -> !req.getRequestURI().startsWith("/api/")))
        .exceptionHandling(
            e ->
                e.accessDeniedHandler(
                    (req, res, ex) -> {
                      if (req.getRequestURI().startsWith("/api/")) {
                        res.setStatus(403);
                        res.setContentType("application/problem+json");
                        res.getWriter()
                            .write(
                                "{\"title\":\"Access denied or invalid CSRF"
                                    + " token\",\"status\":403}");
                      } else res.sendError(403);
                    }));
    return http.build();
  }

  @Bean
  @Profile("demo")
  UserDetailsService demoUsers(
      BCryptPasswordEncoder encoder,
      @Value("${app.demo.staff-password:}") String staffPassword,
      @Value("${app.demo.approver-password:}") String approverPassword) {
    return new InMemoryUserDetailsManager(
        User.withUsername("staff")
            .password(encoder.encode(passwordOrGenerate("staff", staffPassword)))
            .roles("STAFF")
            .build(),
        User.withUsername("approver")
            .password(encoder.encode(passwordOrGenerate("approver", approverPassword)))
            .roles("APPROVER")
            .build());
  }

  // Unset demo passwords are randomly generated and logged once at WARN level.
  private static String passwordOrGenerate(String username, String configured) {
    if (configured != null && !configured.isBlank()) return configured;
    byte[] bytes = new byte[18];
    new SecureRandom().nextBytes(bytes);
    String generated = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    LOG.warn(
        "No demo password configured for '{}'; generated one for this run: {}",
        username,
        generated);
    return generated;
  }

  // Fail closed outside the demo profile until an identity provider is integrated.
  @Bean
  @Profile("!demo")
  UserDetailsService noDemoUsers() {
    return new InMemoryUserDetailsManager();
  }
}
