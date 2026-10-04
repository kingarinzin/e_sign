import { ObjectId } from "mongodb";

/**
 * Helper to normalize user ID from JWT and create organizerId query
 * that works with both string and ObjectId formats (for backwards compatibility)
 */
export function getUserIdVariants(decodedId: any) {
  const userIdStr =
    typeof decodedId === "string"
      ? decodedId
      : decodedId?.toString?.() ?? String(decodedId);

  const userIdObj = ObjectId.isValid(userIdStr) ? new ObjectId(userIdStr) : null;

  // Query that matches both ObjectId and string formats
  const organizerIdQuery = userIdObj ? { $in: [userIdObj, userIdStr] } : userIdStr;

  return { userIdStr, userIdObj, organizerIdQuery };
}
