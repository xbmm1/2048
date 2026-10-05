package org.example.retirement.reporting;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.util.Map;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class ReportTest {
  @Test
  void templateProducesReadableSinglePagePdf() throws Exception {
    byte[] pdf =
        new ReportService(null, null, null)
            .render(
                Map.of(
                    "MEMBER",
                    "Alex Morgan | DEMO-1001",
                    "EMPLOYER",
                    "Demo Mesa Fire District",
                    "ESTIMATE",
                    "Saved estimate #1 | As of 2026-01-01 | LEARNING-1.0",
                    "ELIGIBILITY",
                    "Eligible under fictional learning rules.",
                    "BENEFIT",
                    "Annual pension: $12,000.00     Monthly pension: $1,000.00",
                    "INPUTS",
                    "Age: 60     Service months: 120     Average annual pay: $60,000.00",
                    "TOTALS",
                    "Posted months: 120\n"
                        + "Pensionable pay: $600,000.00\n"
                        + "Employee contributions: $60,000.00\n"
                        + "Employer contributions: $90,000.00"));
    Files.createDirectories(Path.of("target/qa"));
    Files.write(Path.of("target/qa/member-summary.pdf"), pdf);
    try (var document = Loader.loadPDF(pdf)) {
      assertThat(document.getNumberOfPages()).isEqualTo(1);
      assertThat(new PDFTextStripper().getText(document))
          .contains(
              "Alex Morgan",
              "$12,000.00",
              "$60,000.00",
              "LEARNING-1.0",
              "Fictional learning rules");
      ImageIO.write(
          new PDFRenderer(document).renderImageWithDPI(0, 120),
          "png",
          Path.of("target/qa/member-summary.png").toFile());
    }
  }
}
