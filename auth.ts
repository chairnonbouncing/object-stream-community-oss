import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signinSchema } from "@/lib/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  // Required when self-hosting behind a reverse proxy (Wasmer/Docker/etc.);
  // the platform's proxy terminates TLS and forwards the host header.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = signinSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          name: user.username,
          username: user.username,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only defined on initial sign-in.
      if (user) {
        token.id = user.id as string;
        token.username = user.username;
        token.isAdmin = user.isAdmin;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.username = token.username as string;
      session.user.isAdmin = token.isAdmin as boolean;
      return session;
    },
  },
});
