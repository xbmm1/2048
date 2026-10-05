package org.example.retirement.contribution;

import org.springframework.batch.core.job.Job;
import org.springframework.batch.core.job.builder.JobBuilder;
import org.springframework.batch.core.repository.JobRepository;
import org.springframework.batch.core.step.builder.StepBuilder;
import org.springframework.batch.infrastructure.repeat.RepeatStatus;
import org.springframework.context.annotation.*;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class BatchConfig {
  @Bean
  Job contributionImportJob(
      JobRepository repository,
      PlatformTransactionManager transactions,
      ImportProcessor processor) {
    var step =
        new StepBuilder("validateAndPost", repository)
            .tasklet(
                (contribution, context) -> {
                  long id =
                      ((Number) context.getStepContext().getJobParameters().get("importId"))
                          .longValue();
                  processor.process(id);
                  return RepeatStatus.FINISHED;
                },
                transactions)
            .build();
    return new JobBuilder("contributionImport", repository).start(step).build();
  }
}
