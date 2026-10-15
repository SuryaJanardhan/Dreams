import { z } from "zod";

/** Check the credential fields consumed here while retaining other Google SDK fields. */
const credentials = z
  .object({
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    client_email: z.string().optional(),
    private_key: z.string().optional(),
    redirect_uris: z.array(z.string()).optional(),
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
  })
  .passthrough();

export function parseGoogleCredentials(json: string) {
  const value: unknown = JSON.parse(json);
  const {
    client_id,
    client_secret,
    client_email,
    private_key,
    redirect_uris,
    access_token,
    refresh_token,
    ...rest
  } = credentials.parse(value);
  return {
    ...rest,
    ...(client_id === undefined ? {} : { client_id }),
    ...(client_secret === undefined ? {} : { client_secret }),
    ...(client_email === undefined ? {} : { client_email }),
    ...(private_key === undefined ? {} : { private_key }),
    ...(redirect_uris === undefined ? {} : { redirect_uris }),
    ...(access_token === undefined ? {} : { access_token }),
    ...(refresh_token === undefined ? {} : { refresh_token }),
  };
}
