import "@supabase/functions-js/edge-runtime.d.ts";

import { withSupabase } from "@supabase/server";
import { createClient } from "@supabase/supabase-js";

type AccountDeleteRequest = { password?: unknown };
type StorageEntry = { id?: string | null; name: string };

const objectDeleteBatchSize = 100;

// This endpoint is intentionally the only account-deletion entry point. It
// re-authenticates the caller with the current password before a service-role
// client removes data and finally deletes the Supabase Auth user.
export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    const requestId = crypto.randomUUID();
    let stage = "request_validation";

    if (request.method !== "POST") {
      logAccountDeletion("account_deletion_rejected", { requestId, stage, reason: "method_not_allowed" });
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    const body = await request.json().catch(() => null) as AccountDeleteRequest | null;
    const password = body?.password;
    const userId = typeof ctx.userClaims?.id === "string" ? ctx.userClaims.id : null;
    const email = typeof ctx.userClaims?.email === "string" ? ctx.userClaims.email : null;
    if (!userId || !email || typeof password !== "string" || password.length === 0) {
      logAccountDeletion("account_deletion_rejected", { requestId, stage, reason: "invalid_request" });
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    try {
      stage = "configuration";
      const url = requiredEnv("SUPABASE_URL");
      const anonymousKey = requiredApiKey(
        "SUPABASE_ANON_KEY",
        "SUPABASE_PUBLISHABLE_KEYS",
      );
      const serviceRoleKey = requiredApiKey(
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEYS",
      );
      const verifier = createClient(url, anonymousKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      stage = "password_verification";
      const verification = await verifier.auth.signInWithPassword({ email, password });
      if (verification.error || verification.data.user?.id !== userId) {
        logAccountDeletion("account_deletion_rejected", {
          requestId,
          stage,
          reason: "invalid_password",
        });
        return Response.json({ error: "invalid_password" }, { status: 401 });
      }

      const admin = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      logAccountDeletion("account_deletion_started", { requestId });

      stage = "storage_cleanup";
      await removeUserStorage(admin, userId);
      logAccountDeletion("account_deletion_stage_completed", { requestId, stage });

      stage = "database_cleanup";
      const { error: cleanupError } = await admin.rpc("delete_account_data", {
        p_user_id: userId,
      });
      if (cleanupError) throw cleanupError;
      logAccountDeletion("account_deletion_stage_completed", { requestId, stage });

      stage = "auth_user_deletion";
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId, false);
      if (authDeleteError) throw authDeleteError;
      logAccountDeletion("account_deletion_stage_completed", { requestId, stage });
    } catch (error) {
      console.error("account_deletion_failed", {
        requestId,
        stage,
        error: safeErrorDetails(error),
      });
      return Response.json({ error: "deletion_failed" }, { status: 500 });
    }

    logAccountDeletion("account_deletion_completed", { requestId });
    return Response.json({ deleted: true });
  }),
};

/**
 * Function logs must be useful for diagnosis without containing a password,
 * access token, email address, user ID, object path, or raw error message.
 */
function logAccountDeletion(event: string, details: Record<string, unknown>): void {
  console.log(event, details);
}

function safeErrorDetails(error: unknown): Record<string, string | number> {
  if (!error || typeof error !== "object") return { type: typeof error };
  const candidate = error as { name?: unknown; code?: unknown; status?: unknown };
  const details: Record<string, string | number> = {
    type: typeof candidate.name === "string" ? candidate.name.slice(0, 80) : "unknown_error",
  };
  if (typeof candidate.code === "string") details.code = candidate.code.slice(0, 80);
  if (typeof candidate.status === "number") details.status = candidate.status;
  return details;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function requiredApiKey(legacyName: string, namedKeysName: string): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;

  const rawNamedKeys = requiredEnv(namedKeysName);
  const namedKeys = JSON.parse(rawNamedKeys) as Record<string, unknown>;
  const defaultKey = namedKeys.default;
  if (typeof defaultKey !== "string" || defaultKey.length === 0) {
    throw new Error(`${namedKeysName} does not include a default key`);
  }
  return defaultKey;
}

async function removeUserStorage(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const directUserBuckets = ["profile-images", "room-post-images"];
  for (const bucket of directUserBuckets) {
    await removeFolder(admin, bucket, userId);
  }

  // Expense photos are kept as {period-id|personal}/{user-id}/file. Listing
  // each top-level folder also catches orphaned uploads that no longer have a
  // corresponding expense row.
  const roots = await listFolder(admin, "expense-photos", "");
  for (const root of roots) {
    if (root.id !== null && root.id !== undefined) continue;
    await removeFolder(admin, "expense-photos", `${root.name}/${userId}`);
  }
}

async function removeFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<void> {
  const paths = await listFilesRecursively(admin, bucket, prefix);
  for (let index = 0; index < paths.length; index += objectDeleteBatchSize) {
    const { error } = await admin.storage
      .from(bucket)
      .remove(paths.slice(index, index + objectDeleteBatchSize));
    if (error) throw error;
  }
}

async function listFilesRecursively(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const entries = await listFolder(admin, bucket, prefix);
  const files: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id !== null && entry.id !== undefined) files.push(path);
    else files.push(...await listFilesRecursively(admin, bucket, path));
  }
  return files;
}

async function listFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
    });
    if (error) throw error;
    entries.push(...(data ?? []));
    if (!data || data.length < 1000) return entries;
  }
}
