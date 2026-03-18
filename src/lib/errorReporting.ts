import { GCP_PROJECT_ID } from './constants';

/**
 * Reports an error to GCP Cloud Error Reporting.
 * If the project ID is not configured the error is silently logged to console
 * so the app still works in development without GCP credentials.
 */
export async function reportError(
  err: unknown,
  context: string,
  accessToken?: string
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? '') : '';

  console.error(`[${context}]`, message, stack);

  if (!GCP_PROJECT_ID || !accessToken) return;

  try {
    const body = {
      message: `${context}: ${message}\n${stack}`,
      serviceContext: { service: 'smart-transcription-webapp' },
    };
    await fetch(
      `https://clouderrorreporting.googleapis.com/v1beta1/projects/${GCP_PROJECT_ID}/events:report`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
  } catch {
    // Don't surface GCP reporting failures to the user
  }
}
