/**
 * Environment variable configuration for Nextcloud Passwords API.
 */
export interface NextcloudConfig {
  url: string;
  user: string;
  password: string;
}

/**
 * Get Nextcloud configuration from environment variables.
 */
export function getNextcloudConfig(): NextcloudConfig {
  const url = process.env.NEXTCLOUD_URL;
  const user = process.env.NEXTCLOUD_USER;
  const password = process.env.NEXTCLOUD_PASSWORD;

  if (!url || !user || !password) {
    throw new Error(
      'NEXTCLOUD_URL, NEXTCLOUD_USER, and NEXTCLOUD_PASSWORD environment variables must be set'
    );
  }

  let normalizedUrl = url.replace(/\/+$/, '');
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  return { url: normalizedUrl, user, password };
}
