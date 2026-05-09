---
mode: agent
description: Recover from a failed or stuck async batch job
---

# Recover async batch job

I have a failed or stuck async batch job in my output directory.

**Output directory:** {{OUTPUT_DIR}}
**Provider:** {{PROVIDER}} (openai or anthropic)
**Symptom:** {{SYMPTOM}} (e.g. "job failed", "stuck in submitted state", "partial results only")

Please:

1. Read `{{OUTPUT_DIR}}/analysis_job.json` and report:
   - `jobId`, `provider`, `submittedAt`, `status`, `imageCount`
   - How long ago it was submitted

2. Based on the status and age, apply the correct recovery path:

   **If `status: 'failed'`:**
   - Delete `analysis_job.json`
   - Re-run without `--async`:
     ```bash
     node dist/cli/index.js --input ./input --output {{OUTPUT_DIR}} --provider {{PROVIDER}}
     ```

   **If `status: 'submitted'` and submitted >24h ago (OpenAI) or >29 days ago (Anthropic):**
   - The job has likely expired; delete `analysis_job.json` and re-submit:
     ```bash
     node dist/cli/index.js --async --input ./input --output {{OUTPUT_DIR}} --provider {{PROVIDER}}
     ```

   **If `status: 'submitted'` and recently submitted:**
   - The job may still be processing; try resuming:
     ```bash
     node dist/cli/index.js --resume --output {{OUTPUT_DIR}} --provider {{PROVIDER}}
     ```

3. Check for `.analysis_cache_partial.json` in `{{OUTPUT_DIR}}`:
   - If present, some images completed before the failure
   - Use `--skip-analysis` to process those without re-analyzing:
     ```bash
     node dist/cli/index.js --skip-analysis --output {{OUTPUT_DIR}}
     ```

4. Report what was recovered, how many images were processed, and whether any images were lost.
