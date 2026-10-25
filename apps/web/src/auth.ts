import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, withContext } from "@rc/db";
import { enforceRateLimit, recordAudit } from "@rc/domain";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import type { EmailConfig } from "next-auth/providers/email";
import Google from "next-auth/providers/google";
import { sendEmail } from "./server/email";
import { logger } from "./server/logger";

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Adaptador Prisma con correos normalizados a minúsculas (restricción en BD). */
function buildAdapter(): Adapter {
  const base = PrismaAdapter(prisma) as Adapter;
  return {
    ...base,
    createUser: (user) => base.createUser!({ ...user, email: user.email.trim().toLowerCase() }),
    getUserByEmail: (email) => base.getUserByEmail!(email.trim().toLowerCase()),
  };
}

/** Enlace mágico por correo: verifica la propiedad del correo, sin contraseñas. */
const emailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Correo electrónico",
  from: process.env.EMAIL_FROM ?? "RetailControl <no-responder@example.com>",
  maxAge: 10 * 60,
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    await enforceRateLimit(`magic-link:${identifier}`, 5, 15 * 60);
    await sendEmail({
      to: identifier,
      subject: "Su enlace de acceso a RetailControl",
      text: `Use este enlace para entrar a RetailControl (vence en 10 minutos):\n\n${url}\n\nSi usted no lo solicitó, ignore este mensaje.`,
      actionUrl: url,
    });
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: buildAdapter(),
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: { strategy: "database", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login", verifyRequest: "/login/verificar", error: "/login/error" },
  providers: [
    ...(googleEnabled
      ? [
          Google({
            // Google confirma la propiedad del correo (email_verified). Se permite
            // vincular con una cuenta creada por enlace mágico al mismo correo.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    emailProvider,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false;
      const email = user?.email?.toLowerCase();
      if (email) {
        const existing = await prisma.user.findUnique({ where: { email }, select: { disabledAt: true } });
        if (existing?.disabledAt) return false;
      }
      return true;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user?.id) return;
      await withContext({ userId: user.id }, (tx) =>
        recordAudit(tx, {
          tenantId: null,
          actorUserId: user.id!,
          action: "auth.signed_in",
          entityType: "User",
          entityId: user.id!,
          metadata: { provider: account?.provider ?? "desconocido" },
        }),
      ).catch((e) => logger.error({ err: e }, "no se pudo auditar el inicio de sesión"));
    },
  },
  logger: {
    error: (e) => logger.error({ err: { name: e.name, message: e.message } }, "auth.js error"),
    warn: (code) => logger.warn({ code }, "auth.js warning"),
  },
});
