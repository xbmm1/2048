package org.example.retirement.web;

import jakarta.servlet.http.HttpServletRequest;
import org.example.retirement.common.DomainException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.ModelAndView;

@ControllerAdvice
public class ErrorHandler {
  @ExceptionHandler({
    DomainException.class,
    DataIntegrityViolationException.class,
    ObjectOptimisticLockingFailureException.class,
    MethodArgumentNotValidException.class,
    MethodArgumentTypeMismatchException.class,
    HttpMessageNotReadableException.class,
    MaxUploadSizeExceededException.class,
    AccessDeniedException.class
  })
  public Object handle(Exception exception, HttpServletRequest request) {
    HttpStatus status;
    String message;
    if (exception instanceof DomainException ex) {
      status = ex.status;
      message = ex.getMessage();
    } else if (exception instanceof AccessDeniedException) {
      status = HttpStatus.FORBIDDEN;
      message = "Your role cannot perform this action.";
    } else if (exception instanceof DataIntegrityViolationException
        || exception instanceof ObjectOptimisticLockingFailureException) {
      status = HttpStatus.CONFLICT;
      message = "This record already exists or changed. Refresh before retrying.";
    } else if (exception instanceof MaxUploadSizeExceededException) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = "Maximum upload size is 1 MB.";
    } else {
      status = HttpStatus.BAD_REQUEST;
      message = "Invalid request. Check required fields, dates, amounts, and version.";
    }
    if (request.getRequestURI().startsWith("/api/")) {
      var problem = ProblemDetail.forStatusAndDetail(status, message);
      problem.setTitle(status.getReasonPhrase());
      return ResponseEntity.status(status).body(problem);
    }
    var view = new ModelAndView("problem");
    view.setStatus(status);
    view.addObject("message", message);
    return view;
  }
}
