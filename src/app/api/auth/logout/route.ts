import { cookies } from "next/headers";
import { ok, handleError } from "@/lib/api";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";

export async function POST() {
  try {
    const store = await cookies();
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
    return ok({ loggedOut: true });
  } catch (err) {
    return handleError(err);
  }
}
