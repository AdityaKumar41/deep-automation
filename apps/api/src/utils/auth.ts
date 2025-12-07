import { FastifyRequest } from "fastify";
import { prisma as db } from "@evolvx/db";

export async function getCurrentUser(request: FastifyRequest) {
  const auth = request.auth;

  if (!auth?.userId) {
    throw new Error("Unauthorized");
  }

  const user = await db.user.findUnique({
    where: { clerkUserId: auth.userId },
  });

  if (!user) {
    throw new Error("User not found in database");
  }

  return user;
}

export async function getCurrentUserOptional(request: FastifyRequest) {
  try {
    const auth = request.auth;

    if (!auth?.userId) {
      return null;
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: auth.userId },
    });

    return user;
  } catch (error) {
    return null;
  }
}
